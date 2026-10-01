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

/**
 * The instant that is `minute` minutes into local `day` in `timeZone`. Adjusts for the zone's
 * offset twice, so a clock change between the guess and the answer is followed.
 */
export function zonedInstant(day: string, minute: number, timeZone: string): Date {
  const target = parseDay(day) + minute * 60_000;
  let at = target;
  for (let i = 0; i < 2; i++) {
    const local = localTime(timeZone, new Date(at));
    at += target - (parseDay(local.day) + local.minute * 60_000);
  }
  return new Date(at);
}
