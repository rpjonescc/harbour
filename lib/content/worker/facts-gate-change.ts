import { checkClaims } from "@/lib/content/claims-check";
import { allText } from "@/lib/content/piece-text";
import { checkPlatform } from "@/lib/content/platform-check";
import type { ReadPiece } from "@/lib/content/read/pieces";
import type { Claim, Finding, GateEntry } from "@/lib/content/schema";
import type { VoiceProfile } from "@/lib/content/voice";
import { checkRewrite, clipFinding, plain } from "./gate-check";
import { type PieceChange, textHash } from "./gate-write";

export type FactsRun = {
  attempt: 1 | 2;
  jobId: number;
  hosts: string[];
  voice: VoiceProfile;
  factsText: string;
  sourceText: string;
  paragraphIds: string[];
  factRefs: string[];
};
export type FactsReturned = { claims: Claim[]; questions: string[]; content?: unknown };

const UNUSABLE = "This check could not use the piece it returned";
const NOT_SHOWN = "(not shown)";

const verdict = (findings: readonly Finding[], attempt: 1 | 2): GateEntry["result"] => {
  if (findings.length > 0) return "fail";
  return attempt === 1 ? "pass" : "revised";
};

function entryFor(
  gate: "facts" | "platform",
  run: FactsRun,
  hashes: { before: string; after: string },
  over: Partial<GateEntry>,
): GateEntry {
  return {
    gate,
    order: gate === "facts" ? 3 : 4,
    attempt: run.attempt,
    result: "pass",
    findings: [],
    questions: [],
    jobId: run.jobId,
    at: new Date().toISOString(),
    textBefore: hashes.before,
    textAfter: hashes.after,
    // A revision edited text that gates a and b had passed; the record says what it was held to.
    ...(run.attempt === 2 ? { revisedAfter: ["no-ai-slop", "humanizer"] as const } : {}),
    ...over,
  };
}

/**
 * One piece's facts and platform results, decided here from the agent's claims and the worker's
 * own checks. At attempt 2 the returned piece is held to everything the original was (sanitiser,
 * shape, wording only); one that fails is an `error` for both results, with its old text kept.
 * Nothing the agent wrote is stored as it came: claims, questions and findings are plain
 * one-line text, capped.
 */
export function factsChange(
  piece: ReadPiece,
  returned: FactsReturned,
  run: FactsRun,
): { change: PieceChange; stripped: boolean; unusable: boolean } {
  const before = textHash(piece, piece.content);
  if (piece.content === null) throw new Error("A piece with no content is not a gate target");
  let content = piece.content;
  let stripped = false;
  if (run.attempt === 2) {
    const made = checkRewrite(piece, returned.content, run.hosts);
    if (!made.ok) {
      const broken = {
        result: "error" as const,
        findings: [{ pattern: UNUSABLE, quote: "", fix: made.reason }],
      };
      const hashes = { before, after: before };
      const entries = [
        ...piece.gates,
        entryFor("facts", run, hashes, broken),
        entryFor("platform", run, hashes, broken),
      ];
      return { change: { piece, entries, content }, stripped: false, unusable: true };
    }
    content = made.content;
    stripped = made.stripped;
  }
  const hashes = { before, after: textHash(piece, content) };
  const claims = returned.claims.map((c) => ({
    ...c,
    text: plain(c.text, NOT_SHOWN).slice(0, 300),
  }));
  const checked = checkClaims({
    text: allText(content),
    sourceText: run.sourceText,
    factsText: run.factsText,
    claims,
    paragraphIds: run.paragraphIds,
    factRefs: run.factRefs,
    allowedHosts: run.hosts,
  });
  const facts = checked.findings.map(clipFinding);
  const platform = checkPlatform({
    platform: piece.platform,
    content,
    voice: run.voice,
    factsText: run.factsText,
  }).map(clipFinding);
  const questions = returned.questions.map((q) =>
    plain(q, "The check asked something that could not be shown."),
  );
  const entries = [
    ...piece.gates,
    entryFor("facts", run, hashes, {
      result: verdict(facts, run.attempt),
      findings: facts,
      claims,
      questions,
    }),
    entryFor("platform", run, hashes, {
      result: verdict(platform, run.attempt),
      findings: platform,
    }),
  ];
  const extra = { flags: checked.flags, claims };
  return { change: { piece, entries, content, extra }, stripped, unusable: false };
}
