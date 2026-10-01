import type { SearchConsole } from "./inputs";
import { measured, missing, plural, type SubScore, short } from "./sub-score";

/** A flat trend scores 75; +33% or more scores 100; a full drop scores 0. */
const FLAT_TREND = 75;
/** Below this many earlier impressions, a few searches swing the trend: no verdict. */
const MIN_PRIOR_IMPRESSIONS = 100;
/** Days with impressions may differ this much between windows and still compare fairly. */
const MAX_DAY_GAP = 3;

function signedPercent(change: number): string {
  const percent = (change * 100).toFixed(1);
  return change >= 0 ? `+${percent}%` : `−${percent.slice(1)}%`;
}

const days = (n: number) => `${n} ${plural(n, "day")}`;

/**
 * Search impressions trend: mean daily impressions over the days with data in the 28-day
 * window against the 28 days before, as 75 + 75 × change (flat 75, +33% or more 100, a full
 * drop 0). No verdict without at least 100 earlier impressions, or when the day counts differ
 * by more than 3.
 */
export function searchTrend(search: SearchConsole): SubScore {
  const { impressions: now, days: nowDays, priorImpressions: before, priorDays } = search;
  if (before === 0) {
    return missing("No earlier data to compare: no impressions in the 28 days before");
  }
  if (before < MIN_PRIOR_IMPRESSIONS) {
    return missing(
      `Too little volume to judge a trend: ${before} impressions in the 28 days before ` +
        `(needs ${MIN_PRIOR_IMPRESSIONS})`,
    );
  }
  if (now === 0) {
    return measured(0, `No impressions in the last 28 days vs ${before} in the 28 days before.`);
  }
  if (Math.abs(nowDays - priorDays) > MAX_DAY_GAP) {
    return missing(
      `Not comparable: impressions on ${days(nowDays)} in the last 28 days but ${priorDays} in ` +
        "the 28 days before",
    );
  }
  const daily = now / nowDays;
  const priorDaily = before / priorDays;
  const change = (daily - priorDaily) / priorDaily;
  const evidence =
    `${short(daily)} impressions a day over ${days(nowDays)} in the last 28 days vs ` +
    `${short(priorDaily)} a day over ${days(priorDays)} in the 28 days before ` +
    `(${signedPercent(change)}).`;
  return measured(FLAT_TREND + FLAT_TREND * change, evidence);
}
