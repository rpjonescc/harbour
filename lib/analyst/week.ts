import { addDays, parseDay } from "@/lib/format/iso-day";
import { localTime, zonedInstant } from "@/lib/format/zoned-time";

/** The weekly analyst runs on Sundays at 20:00 local time. */
const SLOT_MINUTE = 20 * 60;
const DAY_MS = 24 * 60 * 60_000;

/** Whether `week` is an ISO week label such as "2026-W40". */
export function isWeekLabel(week: string): boolean {
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(week);
}

/** "2026-10-02" → "2026-W40": the ISO 8601 week (weeks start on Monday). Pure. */
export function isoWeekLabel(day: string): string {
  const date = new Date(parseDay(day));
  const weekday = date.getUTCDay() || 7; // Monday 1 … Sunday 7
  // The week belongs to the year of its Thursday.
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The most recent Sunday 20:00 local at or before `now`, as { at: Date, week: label of that Sunday }. */
export function latestWeeklySlot(now: Date, timeZone: string): { at: Date; week: string } {
  const local = localTime(timeZone, now);
  const weekday = new Date(parseDay(local.day)).getUTCDay(); // Sunday 0
  const back = weekday === 0 && local.minute < SLOT_MINUTE ? 7 : weekday;
  const sunday = addDays(local.day, -back);
  return { at: zonedInstant(sunday, SLOT_MINUTE, timeZone), week: isoWeekLabel(sunday) };
}

/** The first Sunday 20:00 local after `now`. */
export function nextWeeklySlot(now: Date, timeZone: string): Date {
  const latest = latestWeeklySlot(now, timeZone);
  const sunday = localTime(timeZone, latest.at).day;
  return zonedInstant(addDays(sunday, 7), SLOT_MINUTE, timeZone);
}
