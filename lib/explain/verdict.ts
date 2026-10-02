export type VerdictTone = "strong" | "good" | "fair" | "weak" | "gap";
export type VerdictLabel = "Strong" | "Good" | "Fair" | "Needs work" | "No score yet";
export type Verdict = { label: VerdictLabel; tone: VerdictTone; sentence: string };

type Band = {
  min: number;
  label: Exclude<VerdictLabel, "No score yet">;
  tone: Exclude<VerdictTone, "gap">;
  sentence: string;
};

/** Spec §3's bands, highest first: each starts at `min` and runs up to the next one. */
export const VERDICT_BANDS: readonly [Band, Band, Band, Band] = [
  { min: 85, label: "Strong", tone: "strong", sentence: "Doing really well. Keep it up." },
  {
    min: 70,
    label: "Good",
    tone: "good",
    sentence: "In good shape, with a little room to improve.",
  },
  { min: 50, label: "Fair", tone: "fair", sentence: "Working, but there's clear room to improve." },
  {
    min: 0,
    label: "Needs work",
    tone: "weak",
    sentence: "Holding you back, so it's worth fixing first.",
  },
];

/** Plain reasons for a missing score that Today can give without reading the breakdown. */
export const GAP_REASONS = {
  notChecked: "Not checked yet.",
  checkFailed: "The last check didn't finish.",
  dataMissing: "The data for this didn't arrive.",
} as const;

const NO_DATA = "No data yet, so there's no verdict.";

/**
 * The verdict for a 0–100 score: its band's word, tone and sentence. No score (or a value that
 * is not a number) is a gap carrying the reason given — never "Needs work": missing data is not
 * a zero.
 */
export function verdictFor(score: number | null, missingReason?: string): Verdict {
  if (score === null || !Number.isFinite(score)) {
    return { label: "No score yet", tone: "gap", sentence: missingReason?.trim() || NO_DATA };
  }
  // A stored score is 0–100; anything below 0 still reads as the lowest band.
  const band = VERDICT_BANDS.find((b) => score >= b.min) ?? VERDICT_BANDS[3];
  return { label: band.label, tone: band.tone, sentence: band.sentence };
}

/** The change since the last check in words; null when either check had no number. */
export function trendPhrase(delta: number | null): string | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (delta === 0) return "steady";
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} since the last check`;
}

/** The bands as one line, for prompts: "Strong (85 or more), Good (70–84), …". */
export function verdictBandsText(): string {
  return VERDICT_BANDS.map((band, i) => {
    const above = VERDICT_BANDS[i - 1];
    if (!above) return `${band.label} (${band.min} or more)`;
    if (band.min === 0) return `${band.label} (under ${above.min})`;
    return `${band.label} (${band.min}–${above.min - 1})`;
  }).join(", ");
}

/** The mean of the scores, rounded; null when there are none (a gap, never a zero). */
export function averageScore(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Why a score is missing: its data didn't arrive, its check failed, or no check has run. */
export function gapReason(state: { scanned: boolean; lastCheckFailed: boolean }): string {
  if (state.scanned) return GAP_REASONS.dataMissing;
  return state.lastCheckFailed ? GAP_REASONS.checkFailed : GAP_REASONS.notChecked;
}
