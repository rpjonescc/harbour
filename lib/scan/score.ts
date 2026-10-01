import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { AEO_SUB_SCORES } from "./scoring/aeo";
import { GEO_SUB_SCORES } from "./scoring/geo";
import { readInputs } from "./scoring/inputs";
import { SEO_SUB_SCORES } from "./scoring/seo";
import { type SubScore, type SubScoreSpec, type Total, toScore } from "./scoring/sub-score";
import type { ScanScores, ScoreScan } from "./types";

/** Bump with any change to a formula, weight or threshold: stored rows keep their version. */
export const FORMULA_VERSION = "v1";

/** Each total's sub-scores. A weight-0 entry is a "not connected yet" note. */
export const SUB_SCORES: Readonly<Record<Total, readonly SubScoreSpec[]>> = {
  seo: SEO_SUB_SCORES,
  geo: GEO_SUB_SCORES,
  aeo: AEO_SUB_SCORES,
};

type Scored = { spec: SubScoreSpec; result: SubScore };

function entryOf({ spec, result }: Scored): ScoreBreakdownEntry {
  const gaps = result.gaps.length > 0 ? ` Incomplete: ${result.gaps.join("; ")}.` : "";
  return {
    key: spec.key,
    label: spec.label,
    score: result.score,
    weight: spec.weight,
    evidence: `${result.evidence}${gaps}`,
    status: result.score === null ? "missing" : "ok",
  };
}

/**
 * The weighted mean of the sub-scores that have a score, rounded like a sub-score; null when
 * none has. Complete only when every weighted sub-score scored with no gaps.
 */
function total(scored: readonly Scored[]): { value: number | null; complete: boolean } {
  const weighted = scored.filter(({ spec }) => spec.weight > 0);
  let sum = 0;
  let weights = 0;
  for (const { spec, result } of weighted) {
    if (result.score === null) continue;
    sum += spec.weight * result.score;
    weights += spec.weight;
  }
  const complete = weighted.every(
    ({ result }) => result.score !== null && result.gaps.length === 0,
  );
  return { value: weights > 0 ? toScore(sum / weights) : null, complete };
}

/**
 * Scoring v1: SEO, GEO and AEO totals (0–100) from a scan's observations, with a breakdown
 * entry per sub-score explaining its number or why it is missing. Pure: same input, same
 * result; a collector that did not end ok, or whose data is malformed, is a gap, never a zero.
 */
export const scoreScan: ScoreScan = (observations, statuses, context): ScanScores => {
  const inputs = readInputs(observations, statuses, context);
  const measure = (specs: readonly SubScoreSpec[]): Scored[] =>
    specs.map((spec) => ({ spec, result: spec.measure(inputs) }));
  const seo = measure(SUB_SCORES.seo);
  const geo = measure(SUB_SCORES.geo);
  const aeo = measure(SUB_SCORES.aeo);
  const [s, g, a] = [total(seo), total(geo), total(aeo)];
  return {
    formulaVersion: FORMULA_VERSION,
    seo: s.value,
    geo: g.value,
    aeo: a.value,
    complete: { seo: s.complete, geo: g.complete, aeo: a.complete },
    breakdown: [...seo, ...geo, ...aeo].map(entryOf),
  };
};
