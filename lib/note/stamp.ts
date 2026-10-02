import { parseDay, zonedInstant } from "@/lib/format/zoned-time";

/** Where the agent writes the notes, inside the brain. */
export const NOTE_DIR = "notes/daily";

const STAMP = /^(\d{4}-\d{2}-\d{2})-([01]\d|2[0-3])([0-5]\d)$/;

/** Whether `value` is a note stamp: a real local date, then HHmm ("2026-10-02-0630"). */
export function isNoteStamp(value: string): boolean {
  const match = STAMP.exec(value);
  if (!match?.[1]) return false;
  try {
    parseDay(match[1]); // throws for a day that does not exist
    return true;
  } catch {
    return false;
  }
}

/** The stamp for a local moment (`localTime`'s day and minute of the day). */
export function noteStamp(local: { day: string; minute: number }): string {
  const hhmm = [Math.floor(local.minute / 60), local.minute % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join("");
  return `${local.day}-${hhmm}`;
}

/** The brain path of a stamp's note; throws on anything that is not a stamp (no path tricks). */
export function notePath(stamp: string): string {
  if (!isNoteStamp(stamp)) {
    throw new Error(
      `Invalid note stamp (expected YYYY-MM-DD-HHmm): ${JSON.stringify(stamp.slice(0, 40))}`,
    );
  }
  return `${NOTE_DIR}/${stamp}.md`;
}

/** The instant a stamp names, in the owner's time zone. */
export function stampInstant(stamp: string, timeZone: string): Date {
  notePath(stamp); // validates
  const minute = Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(13, 15));
  return zonedInstant(stamp.slice(0, 10), minute, timeZone);
}

/** HARBOUR_NOTE_TIME ("06:30") as a minute of the day. */
export function noteMinute(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

/** The stamp the schedule uses for `day` at HARBOUR_NOTE_TIME. */
export function scheduledStamp(day: string, time: string): string {
  return noteStamp({ day, minute: noteMinute(time) });
}

/** "2026-10-02 06:30", for labels. */
export function describeStamp(stamp: string): string {
  notePath(stamp);
  return `${stamp.slice(0, 10)} ${stamp.slice(11, 13)}:${stamp.slice(13, 15)}`;
}
