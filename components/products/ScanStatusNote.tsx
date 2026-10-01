import { formatDateTime } from "@/lib/format/date";
import { collectorLabel } from "@/lib/scan/labels";
import type { ScanState, ScoreSnapshot } from "@/lib/scan/views";

type Props = {
  scan: ScanState;
  latest: ScoreSnapshot | null;
  timeZone: string;
  locale: string;
};

const NOTE = "rounded-sm px-3 py-2 text-xs";

function ActiveNote({
  active,
  at,
}: {
  active: NonNullable<ScanState["active"]>;
  at: (d: Date) => string;
}) {
  const what =
    active.status === "running"
      ? `Scanning now (started ${at(active.since)})`
      : "Scan queued — it starts when the worker is free";
  return (
    <p role="status" className={`${NOTE} bg-accent-soft text-ink`}>
      {what}. This page updates when it finishes.
    </p>
  );
}

function LastScanNote({
  last,
  latest,
  at,
}: {
  last: NonNullable<ScanState["last"]>;
  latest: ScoreSnapshot | null;
  at: (d: Date) => string;
}) {
  const when = at(last.finishedAt ?? last.startedAt);
  const failed = last.status === "failed";
  return (
    <div
      className={`${NOTE} ${last.status === "ok" ? "bg-surface-sunk text-ink-muted" : "bg-warn-soft text-ink"}`}
    >
      <p>
        {failed
          ? `The last scan failed (${when})${last.error ? `: ${last.error}` : ""}.`
          : `Last scan ${when}${last.status === "partial" ? " — partly failed" : ""}.`}
        {failed && (latest ? ` Showing the scan of ${at(latest.computedAt)}.` : " No results yet.")}
      </p>
      {last.failedCollectors.length > 0 && (
        <ul className="mt-1">
          {last.failedCollectors.map((f) => (
            <li key={f.collector}>
              {collectorLabel(f.collector)} failed{f.error ? `: ${f.error}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where the product's scanning stands: never scanned, queued or running, and how the last scan ended. */
export function ScanStatusNote({ scan, latest, timeZone, locale }: Props) {
  const at = (date: Date) => formatDateTime(date, timeZone, locale);
  if (!scan.active && !scan.last) {
    return (
      <p className={`${NOTE} bg-surface-sunk text-ink-muted`}>
        Not scanned yet. Choose Scan now to run the first scan.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {scan.active && <ActiveNote active={scan.active} at={at} />}
      {scan.last && <LastScanNote last={scan.last} latest={latest} at={at} />}
    </div>
  );
}
