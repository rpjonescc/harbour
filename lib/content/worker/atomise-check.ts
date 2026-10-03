import { z } from "zod";
import { PLATFORM_NAMES, type Platform, platformSchema } from "@/lib/content/ids";
import { isTooDeep, sanitiseContent, sanitiseText } from "@/lib/content/sanitise";
import { claimSchema } from "@/lib/content/schema";
import { contentSchemas, type PieceContent } from "@/lib/content/shapes";
import { STUB_FALLBACK } from "@/lib/explain/content";
import { safeReason } from "@/lib/explain/voice/note";
import type { FactItem } from "./facts-pack";

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * What the atomise agent may write. Strict: an unknown key (`state`, `approved`) rejects the whole
 * output. The piece count allows a repeat or two so a duplicate is named as one, not as "too many".
 */
export const atomiseWorkSchema = z.strictObject({
  pieces: z
    .array(
      z.strictObject({
        platform: platformSchema,
        content: z.unknown(),
        claims: z.array(claimSchema).max(20).default([]),
        questions: z.array(text(200)).max(5).default([]),
      }),
    )
    .min(1)
    .max(12),
});
export type AtomiseWork = z.infer<typeof atomiseWorkSchema>;

/** A claim or question the sanitiser would change or refuse: plain text only. */
const isPlain = (value: string): boolean => {
  const clean = sanitiseText(value, "social");
  return clean.ok && !clean.stripped && !/[\n\r]/.test(value);
};

/**
 * Why this output cannot be used at all, in fixed words (platform keys are checked names, never
 * agent text); null when it can. A single bad piece is not this: it becomes a stub.
 */
export function atomiseProblem(
  work: AtomiseWork,
  platforms: readonly Platform[],
  refs: { pack: readonly FactItem[]; paragraphs: readonly string[] },
): string | null {
  const known = new Set([
    ...refs.pack.map((f) => f.ref),
    ...refs.paragraphs.map((id) => `source:${id}`),
  ]);
  const seen = new Set<string>();
  for (const piece of work.pieces) {
    if (!platforms.includes(piece.platform))
      return `The platform ${piece.platform} was not asked for.`;
    if (seen.has(piece.platform)) return `The platform ${piece.platform} appears more than once.`;
    seen.add(piece.platform);
    const name = PLATFORM_NAMES[piece.platform];
    if (isTooDeep(piece.content)) return `The ${name} piece is nested too deeply.`;
    for (const claim of piece.claims) {
      if (claim.trace !== "none" && !known.has(claim.trace)) {
        return `A claim in the ${name} piece cites a paragraph or fact that does not exist.`;
      }
    }
    if (![...piece.claims.map((c) => c.text), ...piece.questions].every(isPlain)) {
      return `The claims and questions of the ${name} piece must be plain one-line text.`;
    }
  }
  return null;
}

type Issue = { path: PropertyKey[]; code: string; message: string };

/** Zod's issues in fixed words: field names and zod's own messages, never the agent's values. */
function describePieceIssues(issues: readonly Issue[]): string {
  return issues
    .slice(0, 3)
    .map((issue) => {
      if (issue.code === "unrecognized_keys")
        return "it has a field that is not part of the format";
      const field = issue.path.map((p) => safeReason(String(p))).join(" ") || "the content";
      return `${field} ${issue.message}`;
    })
    .join("; ");
}

export type MadePiece = { content: PieceContent | null; stub: string | null; stripped: boolean };

const stub = (name: string, why: string, stripped = false): MadePiece => ({
  content: null,
  stub: `The ${name} piece wasn't written: ${why}`,
  stripped,
});

/** One piece alone: sanitise, then check against its platform's shape. A failure is a stub. */
export function makeOne(
  piece: AtomiseWork["pieces"][number] | undefined,
  platform: Platform,
  hosts: readonly string[],
): MadePiece {
  const name = PLATFORM_NAMES[platform];
  if (!piece)
    return {
      content: null,
      stub: STUB_FALLBACK,
      stripped: false,
    };
  if (piece.content === null || typeof piece.content !== "object" || Array.isArray(piece.content)) {
    return stub(name, "it has no content.");
  }
  const clean = sanitiseContent(platform, piece.content, hosts);
  if (!clean.ok) return stub(name, clean.reason);
  const shaped = contentSchemas[platform].safeParse(clean.content);
  if (!shaped.success)
    return stub(name, `${describePieceIssues(shaped.error.issues)}.`, clean.stripped);
  return { content: shaped.data as PieceContent, stub: null, stripped: clean.stripped };
}
