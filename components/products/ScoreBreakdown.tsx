import { ScoreBar } from "@/components/ui/ScoreBar";
import { ScoreValue } from "@/components/ui/ScoreValue";
import { Tag } from "@/components/ui/Tag";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import type { AreaKey } from "@/lib/scan/views";

function weightNote(entry: ScoreBreakdownEntry, area: string): string {
  return entry.weight > 0 ? `${Math.round(entry.weight * 100)}% of ${area}` : "Not counted yet";
}

function statusTag(entry: ScoreBreakdownEntry) {
  if (entry.status === "ok") return null;
  return (
    <Tag tone={entry.weight > 0 ? "warn" : "neutral"}>
      {entry.weight > 0 ? "Missing" : "Not connected"}
    </Tag>
  );
}

/**
 * One score's sub-scores: label, weight, number, bar and the evidence behind it — or why it is
 * missing. Entries come from the stored breakdown, keyed "<area>.<name>".
 */
export function ScoreBreakdown({
  area,
  entries,
  complete,
}: {
  area: AreaKey;
  entries: ScoreBreakdownEntry[];
  complete: boolean;
}) {
  const name = area.toUpperCase();
  const own = entries.filter((entry) => entry.key.startsWith(`${area}.`));
  if (own.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No {name} breakdown yet: it appears after the first scan.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-muted">
        {complete
          ? `Every source ${name} needs reported in this scan.`
          : `Incomplete: parts marked Missing had no data in this scan and are left out, not counted as zero.`}
      </p>
      <ul className="divide-y divide-line">
        {own.map((entry) => (
          <li key={entry.key} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-baseline gap-3">
              <h3 className="text-sm font-medium text-ink">{entry.label}</h3>
              <span className="text-2xs text-ink-muted">{weightNote(entry, name)}</span>
              <span className="ml-auto text-sm">
                <ScoreValue value={entry.score} />
              </span>
            </div>
            {entry.weight > 0 && <ScoreBar value={entry.score} />}
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {statusTag(entry)}
              <span>{entry.evidence}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
