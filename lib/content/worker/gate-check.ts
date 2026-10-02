import { z } from "zod";
import { platformSchema } from "@/lib/content/ids";
import { unknownNumbers } from "@/lib/content/numbers";
import { allText } from "@/lib/content/piece-text";
import type { ReadPiece } from "@/lib/content/read/pieces";
import { sanitiseText } from "@/lib/content/sanitise";
import type { Finding, GateEntry } from "@/lib/content/schema";
import type { PieceContent } from "@/lib/content/shapes";
import { makeOne } from "./atomise-check";
import { textHash } from "./gate-write";
import type { SkillName } from "./skills";

const text = (max: number) => z.string().trim().min(1).max(max);
// Quotes and fixes are clipped to 200 characters when stored: a long one is not worth a retry.
const finding = z.strictObject({
  pattern: text(100),
  quote: z.string().max(2000),
  fix: z.string().max(2000),
});

/** What a gate agent may write. Strict: an unknown key (`state`, `approved`) rejects the lot. */
export const gateWorkSchema = z.strictObject({
  pieces: z
    .array(
      z.strictObject({
        platform: platformSchema,
        content: z.unknown(),
        findings: z.array(finding).max(20).default([]),
        questions: z.array(text(200)).max(5).default([]),
      }),
    )
    .min(1)
    .max(6),
});
export type GateWork = z.infer<typeof gateWorkSchema>;
type Returned = GateWork["pieces"][number];

const LINKS = /https?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/gi;
const TAGS = /[#@][\p{L}\p{N}_]+/gu;
const found = (pattern: RegExp, joined: string) =>
  new Set([...joined.matchAll(pattern)].map((m) => m[0].toLowerCase().replace(/[.,;:!?]+$/, "")));
const addsAny = (before: Set<string>, after: Set<string>) => [...after].some((x) => !before.has(x));

/**
 * Why a rewritten piece may not replace the one the gate was given, or null. A gate edits
 * wording only: a number, link, hashtag or @handle that was not already there is an invention,
 * and the same sanitiser and shape checks as the original still apply on top of this.
 */
export function rewriteProblem(before: PieceContent, after: PieceContent): string | null {
  const was = allText(before);
  const now = allText(after);
  if (unknownNumbers(now, was).length > 0) return "It added a number that was not in the piece.";
  if (addsAny(found(LINKS, was), found(LINKS, now))) return "It added a link.";
  if (addsAny(found(TAGS, was), found(TAGS, now))) return "It added a hashtag or an @handle.";
  return null;
}

/** An agent's finding, claim or question as plain one-line text: what cannot be shown is replaced, never kept. */
export function plain(value: string, fallback: string): string {
  const clean = sanitiseText(value, "social");
  return clean.ok && !/[\n\r]/.test(clean.text) && clean.text.trim() !== ""
    ? clean.text.trim()
    : fallback;
}

export const clipFinding = (f: Finding): Finding => ({
  pattern: plain(f.pattern, "(not shown)").slice(0, 100),
  quote: plain(f.quote, "(not shown)").slice(0, 200),
  fix: plain(f.fix, "(not shown)").slice(0, 200),
});

export type Provenance = {
  gate: "no-ai-slop" | "humanizer";
  order: 1 | 2;
  attempt: 1 | 2;
  jobId: number;
  instructions: { name: SkillName; source: string; sha256: string };
};

const UNUSABLE = "This check could not use the piece it returned";

export type Rewrite =
  | { ok: true; content: PieceContent; stripped: boolean }
  | { ok: false; reason: string };

/**
 * A gate agent's returned content, held to everything the original had to pass (the sanitiser,
 * its platform's shape) and to the wording-only rule. The reason is a fixed sentence, never the
 * agent's words.
 */
export function checkRewrite(
  piece: ReadPiece,
  returned: unknown,
  hosts: readonly string[],
): Rewrite {
  const before = piece.content;
  if (before === null) throw new Error("A piece with no content is not a gate target");
  const made = makeOne(
    { platform: piece.platform, content: returned, claims: [], questions: [] },
    piece.platform,
    hosts,
  );
  if (made.content === null) {
    const stub = (made.stub ?? "It could not be read.").replace(
      /^The [^:]*piece wasn't written: /,
      "",
    );
    return { ok: false, reason: stub.slice(0, 200) };
  }
  const reason = rewriteProblem(before, made.content);
  return reason === null
    ? { ok: true, content: made.content, stripped: made.stripped }
    : { ok: false, reason: reason.slice(0, 200) };
}

/**
 * One piece's gate entry and new content from what the agent returned. A returned piece that
 * fails the sanitiser, its platform's shape or the wording-only rule is an `error` for that piece
 * alone, with its old text kept; the reason is a fixed sentence, never the agent's words.
 */
export function outcome(
  piece: ReadPiece,
  returned: Returned,
  base: Provenance,
  hosts: readonly string[],
): { entry: GateEntry; content: PieceContent; stripped: boolean } {
  const before = piece.content;
  if (before === null) throw new Error("A piece with no content is not a gate target");
  const stamp = { ...base, at: new Date().toISOString() };
  const made = checkRewrite(piece, returned.content, hosts);
  const hash = textHash(piece, before);
  if (!made.ok) {
    const entry: GateEntry = {
      ...stamp,
      result: "error",
      findings: [{ pattern: UNUSABLE, quote: "", fix: made.reason }],
      questions: [],
      textBefore: hash,
      textAfter: hash,
    };
    return { entry, content: before, stripped: false };
  }
  const findings = returned.findings.map(clipFinding);
  const asked = returned.questions.map((q) =>
    plain(q, "The check asked something that could not be shown."),
  );
  const result = findings.length > 0 ? "fail" : base.attempt === 1 ? "pass" : "revised";
  const entry: GateEntry = {
    ...stamp,
    result,
    findings,
    questions: asked,
    textBefore: hash,
    textAfter: textHash(piece, made.content),
  };
  return { entry, content: made.content, stripped: made.stripped };
}
