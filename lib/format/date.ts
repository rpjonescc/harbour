/**
 * Weekday, day and month in the given IANA zone and locale, e.g. "Thursday 1 October" (en-GB)
 * or "Thursday October 1" (en-US). Formatted as two parts so we never depend on the locale's
 * punctuation between them.
 */
export function formatLongDate(date: Date, timeZone: string, locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }).format(date);
  const dayMonth = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(date);
  return `${weekday} ${dayMonth}`;
}

/** YYYY-MM-DD for `date` as seen in `timeZone`. */
export function isoDateIn(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Medium date and short time, e.g. "1 Oct 2026, 10:30". */
export function formatDateTime(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
