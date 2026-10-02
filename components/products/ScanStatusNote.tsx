import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { activeScanSentence, lastScanSentence, NEVER_SCANNED } from "@/lib/explain/scan-status";
import { sourceStatusPhrase } from "@/lib/explain/sources";
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
  return (
    <p role="status" className={`${NOTE} bg-accent-soft text-ink`}>
      {activeScanSentence(active.status, at(active.since))}
    </p>
  );
}

function RawErrors({ last }: { last: NonNullable<ScanState["last"]> }) {
  if (last.error === null && last.failedCollectors.length === 0) return null;
  return (
    <div className="mt-2">
      <TechnicalDetails id="scan-errors" topic="what Harbour recorded about the problem">
        <ul className="flex flex-col gap-0.5">
          {last.error !== null && <li>{last.error}</li>}
          {last.failedCollectors.map((f) => (
            <li key={f.collector}>
              <span>{sourceStatusPhrase(f.collector, "failed")}</span>{" "}
              <span>
                {collectorLabel(f.collector)}: {f.error ?? "no message recorded"}
              </span>
            </li>
          ))}
        </ul>
      </TechnicalDetails>
    </div>
  );
}

function LastScanNote({
  last,
  latest,
  active,
  at,
}: {
  last: NonNullable<ScanState["last"]>;
  latest: ScoreSnapshot | null;
  active: boolean;
  at: (d: Date) => string;
}) {
  const sentence = lastScanSentence({
    status: last.status,
    when: at(last.finishedAt ?? last.startedAt),
    showing: latest ? at(latest.computedAt) : null,
    active,
  });
  return (
    <div
      className={`${NOTE} ${last.status === "ok" ? "bg-surface-sunk text-ink-muted" : "bg-warn-soft text-ink"}`}
    >
      <p>{sentence}</p>
      <RawErrors last={last} />
    </div>
  );
}

/** Where the product's scanning stands: never scanned, queued or running, and how the last scan ended. */
export function ScanStatusNote({ scan, latest, timeZone, locale }: Props) {
  const at = (date: Date) => formatDateTime(date, timeZone, locale);
  if (!scan.active && !scan.last) {
    return <p className={`${NOTE} bg-surface-sunk text-ink-muted`}>{NEVER_SCANNED}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {scan.active && <ActiveNote active={scan.active} at={at} />}
      {scan.last && (
        <LastScanNote last={scan.last} latest={latest} active={scan.active !== null} at={at} />
      )}
    </div>
  );
}
