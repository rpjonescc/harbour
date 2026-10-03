import type { FourParts } from "../four-parts";

/** A sub-score in plain words: its name, the four parts, and how to read its evidence. */
export type SubScoreExplanation = {
  /** The formula's key, e.g. "seo.technical". */
  key: string;
  name: string;
  parts: FourParts;
  /**
   * A one-line plain reading of the numbers in the stored evidence; null when the evidence does
   * not have the expected wording (an older formula's), so the caller uses the verdict instead.
   */
  summarise: (evidence: string) => string | null;
  /**
   * Said after the reading when a formula measures the sub-score but gives it weight 0, so the
   * owner knows it is shown for information and why it doesn't count.
   */
  notCounted?: string;
};

/**
 * The named groups `names` that `pattern` captures in `evidence`, as whole numbers; null unless
 * it matches and every group is one. Evidence is stored text, so it is read defensively.
 */
export function numbersIn<const K extends string>(
  evidence: string,
  pattern: RegExp,
  names: readonly K[],
): Record<K, number> | null {
  const groups = pattern.exec(evidence)?.groups;
  if (!groups) return null;
  const found: Partial<Record<K, number>> = {};
  for (const name of names) {
    const text = groups[name];
    if (text === undefined || !/^\d+$/.test(text)) return null;
    found[name] = Number(text);
  }
  // Every name was filled above, or the function returned null.
  return found as Record<K, number>;
}
