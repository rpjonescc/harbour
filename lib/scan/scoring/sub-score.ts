import type { ScoringInputs, Source } from "./inputs";

/**
 * One sub-score's result: a 0–100 integer with the evidence behind it, or null with the reason
 * it is missing. `gaps` name inputs that were partly unknown: the score stands, but the total
 * it feeds is incomplete.
 */
export type SubScore = { score: number | null; evidence: string; gaps: string[] };

export type Total = "seo" | "geo" | "aeo";

/** A sub-score of the v1 formula. Weight 0 marks a "not connected yet" note, not a score. */
export type SubScoreSpec = {
  key: string;
  label: string;
  weight: number;
  measure: (inputs: ScoringInputs) => SubScore;
};

/**
 * Rounds to a whole point, half up, then clamps to 0–100. Floating-point noise is cut at 6
 * decimals first, so 72.4999999999 (meaning 72.5) rounds to 73.
 */
export function toScore(value: number): number {
  const rounded = Math.round(Number(value.toFixed(6)));
  return Math.min(100, Math.max(0, rounded));
}

export function measured(value: number, evidence: string, gaps: string[] = []): SubScore {
  return { score: toScore(value), evidence, gaps };
}

export function missing(reason: string): SubScore {
  return { score: null, evidence: reason, gaps: [] };
}

/** Runs `measure` when every source is available; otherwise missing with the first reason. */
export function withSources<T extends unknown[]>(
  sources: { [K in keyof T]: Source<T[K]> },
  measure: (...values: T) => SubScore,
): SubScore {
  const values: unknown[] = [];
  for (const source of sources) {
    if (!source.ok) return missing(source.reason);
    values.push(source.value);
  }
  return measure(...(values as T));
}

/** The word for `n` things: `plural(1, "page")` is "page", `plural(2, "page")` is "pages". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** One decimal at most: 8.333 → "8.3", 25 → "25". */
export const short = (value: number) => String(Number(value.toFixed(1)));
