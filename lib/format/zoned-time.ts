// Local-time slots in an IANA zone, via Intl date parts so clock changes are followed. Pure.

const DAY_MS = 24 * 60 * 60_000;

export type LocalTime = { day: string; minute: number };

/** The local date (YYYY-MM-DD) and minute of the day of `at` in `timeZone`, DST-aware. */
export function localTime(timeZone: string, at: Date): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Midnight UTC of `day` (YYYY-MM-DD) in ms; throws on anything that is not a real date. */
export function parseDay(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(ms) || toDay(ms) !== day) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${day}`);
  }
  return ms;
}

/** `day` moved by `days` calendar days. */
export function addDays(day: string, days: number): string {
  return toDay(parseDay(day) + days * DAY_MS);
}

/** Minutes the zone's clock is ahead of UTC at `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  const local = localTime(timeZone, new Date(ms));
  return Math.round((parseDay(local.day) + local.minute * 60_000 - ms) / 60_000);
}

/**
 * The instant `minute` minutes into local `day`. In a fall-back overlap: the earlier instant.
 * In a spring-forward gap: the same wall-clock distance after the gap (03:15 → 04:15).
 */
export function zonedInstant(day: string, minute: number, timeZone: string): Date {
  const wall = parseDay(day) + minute * 60_000;
  // Clock changes are months apart, so a day either side gives the offsets around this one.
  const before = offsetAt(wall - DAY_MS, timeZone);
  const after = offsetAt(wall + DAY_MS, timeZone);
  const valid = [before, after]
    .map((offset) => wall - offset * 60_000)
    .filter((at) => offsetAt(at, timeZone) * 60_000 === wall - at);
  // No valid instant: the wall time falls in a gap, so read it on the clock from before the gap.
  return new Date(valid.length > 0 ? Math.min(...valid) : wall - before * 60_000);
}

/** The local day whose `minute` slot is the latest at or before `now` (today, else yesterday). */
export function latestDailySlotDay(now: Date, timeZone: string, minute: number): string {
  const local = localTime(timeZone, now);
  return local.minute >= minute ? local.day : addDays(local.day, -1);
}

/** The first `minute` slot strictly after `now`. */
export function nextDailySlot(now: Date, timeZone: string, minute: number): Date {
  const day = localTime(timeZone, now).day;
  const today = zonedInstant(day, minute, timeZone);
  return today.getTime() > now.getTime() ? today : zonedInstant(addDays(day, 1), minute, timeZone);
}

/** Month label (YYYY-MM) `by` calendar months after `month`. */
function shiftMonth(month: string, by: number): string {
  const date = new Date(parseDay(`${month}-01`));
  date.setUTCMonth(date.getUTCMonth() + by);
  return toDay(date.getTime()).slice(0, 7);
}

/** The local calendar month containing `now`: { label: "2026-10", start, end } (start inclusive, end exclusive). */
export function monthWindow(
  now: Date,
  timeZone: string,
): { label: string; start: Date; end: Date } {
  const label = localTime(timeZone, now).day.slice(0, 7);
  return {
    label,
    start: zonedInstant(`${label}-01`, 0, timeZone),
    end: zonedInstant(`${shiftMonth(label, 1)}-01`, 0, timeZone),
  };
}

/** The monthly slot is the first Sunday of the month at 21:00 local time. */
const MONTHLY_SLOT_MINUTE = 21 * 60;

function monthlySlotOf(month: string, timeZone: string): Date {
  const first = `${month}-01`;
  const weekday = new Date(parseDay(first)).getUTCDay(); // Sunday 0
  return zonedInstant(addDays(first, (7 - weekday) % 7), MONTHLY_SLOT_MINUTE, timeZone);
}

/** The latest first-Sunday-of-the-month 21:00 local at or before `now`: { at, month: "2026-10" }. */
export function latestMonthlySlot(now: Date, timeZone: string): { at: Date; month: string } {
  const month = localTime(timeZone, now).day.slice(0, 7);
  const at = monthlySlotOf(month, timeZone);
  if (at.getTime() <= now.getTime()) return { at, month };
  const previous = shiftMonth(month, -1);
  return { at: monthlySlotOf(previous, timeZone), month: previous };
}

/** The first monthly slot strictly after `now`. */
export function nextMonthlySlot(now: Date, timeZone: string): Date {
  return monthlySlotOf(shiftMonth(latestMonthlySlot(now, timeZone).month, 1), timeZone);
}
