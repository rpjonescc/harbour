import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { verdictFor } from "../verdict";
import type { SubScoreExplanation } from "./entry";
import { GEO_EXPLANATIONS } from "./geo";
import { missingLine } from "./missing";
import { SEO_EXPLANATIONS } from "./seo";

export type { SubScoreExplanation } from "./entry";

/** Every sub-score of the current formula in plain words, in formula order. */
export const SUB_SCORE_EXPLANATIONS: readonly SubScoreExplanation[] = [
  ...SEO_EXPLANATIONS,
  ...GEO_EXPLANATIONS,
];

const BY_KEY = new Map(SUB_SCORE_EXPLANATIONS.map((e) => [e.key, e]));

/** The plain explanation of a sub-score key; null for a key the current formula doesn't have. */
export function subScoreExplanation(key: string): SubScoreExplanation | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * One plain line for a stored breakdown entry: why it is missing, what its evidence says, or —
 * for wording Harbour can't read (an older formula's) — its verdict's sentence.
 */
export function subScoreLine(
  entry: Pick<ScoreBreakdownEntry, "key" | "score" | "evidence">,
): string {
  if (entry.score === null) return missingLine(entry.evidence);
  const read = subScoreExplanation(entry.key)?.summarise(entry.evidence) ?? null;
  return read ?? verdictFor(entry.score).sentence;
}
