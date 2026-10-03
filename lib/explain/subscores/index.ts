import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import type { OutsideView } from "@/lib/scan/outside-view";
import { verdictFor } from "../verdict";
import { AEO_EXPLANATIONS } from "./aeo";
import type { SubScoreExplanation } from "./entry";
import { aiEnginesLine, GEO_EXPLANATIONS } from "./geo";
import { missingLine } from "./missing";
import { SEO_EXPLANATIONS } from "./seo";

export type { SubScoreExplanation } from "./entry";

/** Every sub-score of the current formula in plain words, in formula order. */
export const SUB_SCORE_EXPLANATIONS: readonly SubScoreExplanation[] = [
  ...SEO_EXPLANATIONS,
  ...GEO_EXPLANATIONS,
  ...AEO_EXPLANATIONS,
];

const BY_KEY = new Map(SUB_SCORE_EXPLANATIONS.map((e) => [e.key, e]));

/** The plain explanation of a sub-score key; null for a key the current formula doesn't have. */
export function subScoreExplanation(key: string): SubScoreExplanation | null {
  return BY_KEY.get(key) ?? null;
}

/** The tag on a sub-score that is measured but has weight 0 in its formula. */
export const NOT_COUNTED = "Not counted";

/** Whether a stored entry was measured for information only: it has a score but weight 0. */
export const isInformational = (entry: { score: number | null; weight?: number }) =>
  entry.score !== null && entry.weight === 0;

/**
 * One plain line for a stored breakdown entry: why it is missing, what its evidence says, or —
 * for wording Harbour can't read (an older formula's) — its verdict's sentence. A measured entry
 * of weight 0 says why it isn't counted; AI engine mentions follow How the web sees you's state.
 */
export function subScoreLine(
  entry: Pick<ScoreBreakdownEntry, "key" | "score" | "evidence"> & { weight?: number },
  outside?: OutsideView["state"],
): string {
  if (entry.score === null) {
    if (entry.key === "geo.aiEngines" && outside) return aiEnginesLine(outside);
    return missingLine(entry.evidence);
  }
  const explanation = subScoreExplanation(entry.key);
  const read = explanation?.summarise(entry.evidence) ?? null;
  const notCounted = isInformational(entry) ? explanation?.notCounted : undefined;
  if (read === null) return notCounted ?? verdictFor(entry.score).sentence;
  return notCounted ? `${read} ${notCounted}` : read;
}

/** Gaps and checks that aren't counted rank after every counted score. */
const rank = (entry: { score: number | null; weight?: number }) =>
  entry.score === null || entry.weight === 0 ? Number.POSITIVE_INFINITY : entry.score;

/**
 * Entries weakest first, so the top one is the best place to start. A sub-score with no number is
 * a gap, not a weak one, and one measured but not counted is information, not work: both go last
 * instead of implying a worse score than the data supports.
 */
export function weakestFirst<T extends { score: number | null; weight?: number }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1));
}
