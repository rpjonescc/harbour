import { formatLongDate } from "@/lib/format/date";

/** Date, scan status and the one-line headline. */
export function TodayHeader({
  now,
  timeZone,
  locale,
  scannedAt,
  headline,
}: {
  now: Date;
  timeZone: string;
  locale: string;
  scannedAt: Date | null;
  headline: string;
}) {
  return (
    <header>
      <p className="text-sm text-ink-muted">
        {formatLongDate(now, timeZone, locale)} · {scannedAt ? "scan complete" : "no scan yet"}
      </p>
      <h1 className="mt-1 font-serif text-3xl leading-tight">{headline}</h1>
    </header>
  );
}
