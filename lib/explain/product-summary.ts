import type { AreaKey, AreaValues } from "@/lib/scan/views";
import { AREA_ORDER, AREAS } from "./areas";
import { averageScore, verdictFor } from "./verdict";

/**
 * The Product page's one line: the product's health, its weakest area when that is worth naming,
 * and a note when some scores are missing. Same words as Today's briefing; no scores, no verdict.
 */
export function productSummary(name: string, totals: AreaValues<number | null> | null): string {
  const scored = AREA_ORDER.flatMap((key): { key: AreaKey; score: number }[] => {
    const score = totals?.[key] ?? null;
    return score === null ? [] : [{ key, score }];
  });
  const mean = averageScore(scored.map((s) => s.score));
  if (mean === null) return `Harbour hasn't scored ${name} yet, so there's no verdict.`;
  const label = verdictFor(mean).label;
  const parts = [
    label === "Needs work"
      ? `${name} needs some work.`
      : `${name} is in ${label.toLowerCase()} shape.`,
  ];
  // Earlier area wins a tie for lowest, matching the briefing's opportunity rule.
  const weakest = scored.reduce((low, s) => (s.score < low.score ? s : low));
  const weakestLabel = verdictFor(weakest.score).label;
  // A tie at the top is no "weakest": naming one of two equal areas would mislead.
  const best = Math.max(...scored.map((s) => s.score));
  if (weakest.score < best && weakestLabel !== "Strong") {
    parts.push(`Weakest: ${AREAS[weakest.key].name} (${weakestLabel.toLowerCase()}).`);
  }
  if (scored.length < AREA_ORDER.length) parts.push("Some scores are still missing data.");
  return parts.join(" ");
}
