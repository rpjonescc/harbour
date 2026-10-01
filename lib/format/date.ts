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
