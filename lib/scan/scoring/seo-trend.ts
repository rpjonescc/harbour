import type { GscDay, SearchConsole } from "./inputs";
import { measured, missing, plural, type SubScore, short } from "./sub-score";

const DAY_MS = 24 * 60 * 60_000;
/** A flat trend scores 75; +33% or more scores 100; a full drop scores 0. */
const FLAT_TREND = 75;
/** Below this many earlier impressions, a few searches swing the trend: no verdict. */
const MIN_PRIOR_IMPRESSIONS = 100;
/**
 * Missing days at the end of the current window may be Search Console's lag rather than zeros:
 * up to this many are left out of the mean.
 */
const MAX_LAG_DAYS = 3;
/** Earlier data starting this many days into its window means the baseline is not complete. */
const MAX_LATE_START_DAYS = 7;

/** Days from `start` to `date` (both YYYY-MM-DD). */
const offset = (start: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);

const total = (days: readonly GscDay[]) => days.reduce((n, d) => n + d.impressions, 0);

/** Days since `start` of the earliest row, or null without rows. */
function firstOffset(days: readonly GscDay[], start: string): number | null {
  if (days.length === 0) return null;
  return Math.min(...days.map((d) => offset(start, d.date)));
}

/** Missing days at the end of a window of `length` days, at most MAX_LAG_DAYS. */
function trailingLag(days: readonly GscDay[], start: string, length: number): number {
  const present = new Set(days.map((d) => offset(start, d.date)));
  let lag = 0;
  while (lag < MAX_LAG_DAYS && !present.has(length - 1 - lag)) lag++;
  return lag;
}

function signedPercent(change: number): string {
  const percent = (change * 100).toFixed(1);
  return change >= 0 ? `+${percent}%` : `−${percent.slice(1)}%`;
}

const dayCount = (n: number) => `${n} ${plural(n, "day")}`;

/** Why there is no baseline to compare with, or null when there is one. */
function noBaseline(search: SearchConsole): string | null {
  const { window, days, priorDays } = search;
  const before = total(priorDays);
  if (before === 0) return "No earlier data to compare: no impressions in the 28 days before";
  if (before < MIN_PRIOR_IMPRESSIONS) {
    return (
      `Too little volume to judge a trend: ${before} impressions in the 28 days before ` +
      `(needs ${MIN_PRIOR_IMPRESSIONS})`
    );
  }
  const priorStart = firstOffset(priorDays, window.priorStartDate) ?? 0;
  const currentStart = firstOffset(days, window.startDate);
  const currentOnTime = currentStart !== null && currentStart <= MAX_LATE_START_DAYS;
  if (priorStart > MAX_LATE_START_DAYS && currentOnTime) {
    const first = priorDays.map((d) => d.date).sort()[0];
    return (
      `No full baseline: earlier data starts on ${first}, ${dayCount(priorStart)} into the 28 ` +
      "days before (the property may be newer)"
    );
  }
  return null;
}

/**
 * Search impressions trend: mean daily impressions over the 28-day window against the 28 days
 * before, as 75 + 75 × change (flat 75, +33% or more 100, a full drop 0). A day without a row is
 * a zero, except up to 3 missing days at the end of the current window (Search Console's lag).
 * No verdict without 100 earlier impressions or a full earlier window.
 */
export function searchTrend(search: SearchConsole): SubScore {
  const why = noBaseline(search);
  if (why) return missing(why);
  const { window, days, priorDays } = search;
  const before = total(priorDays);
  const now = total(days);
  if (now === 0) {
    return measured(0, `No impressions in the last 28 days vs ${before} in the 28 days before.`);
  }
  const length = offset(window.startDate, window.endDate) + 1;
  const counted = length - trailingLag(days, window.startDate, length);
  const priorLength = offset(window.priorStartDate, window.priorEndDate) + 1;
  const daily = now / counted;
  const priorDaily = before / priorLength;
  const change = (daily - priorDaily) / priorDaily;
  const evidence =
    `${short(daily)} impressions a day over ${dayCount(counted)} in the last 28 days vs ` +
    `${short(priorDaily)} a day over ${dayCount(priorLength)} in the 28 days before ` +
    `(${signedPercent(change)}).`;
  return measured(FLAT_TREND + FLAT_TREND * change, evidence);
}
