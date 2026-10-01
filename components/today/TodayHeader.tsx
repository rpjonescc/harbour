import { formatDateTime, formatLongDate } from "@/lib/format/date";

/** Date, scan status and the one-line headline. */
export function TodayHeader({
  now,
  timeZone,
  locale,
  scannedAt,
  scanning,
  lastFailedAt,
  headline,
}: {
  now: Date;
  timeZone: string;
  locale: string;
  scannedAt: Date | null;
  scanning: boolean;
  lastFailedAt: Date | null;
  headline: string;
}) {
  const status = scanning
    ? "scan running"
    : scannedAt
      ? `last scan ${formatDateTime(scannedAt, timeZone, locale)}`
      : lastFailedAt
        ? `last scan failed ${formatDateTime(lastFailedAt, timeZone, locale)}`
        : "no scan yet";
  return (
    <header>
      <p className="text-sm text-ink-muted">
        {formatLongDate(now, timeZone, locale)} · {status}
      </p>
      <h1 className="mt-1 font-serif text-3xl leading-tight">{headline}</h1>
    </header>
  );
}
