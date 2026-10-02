import { EmptyState } from "@/components/explain/EmptyState";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Panel } from "@/components/ui/Panel";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { AREAS } from "@/lib/explain/areas";
import { weakestFirst } from "@/lib/explain/subscores";
import type { AreaKey } from "@/lib/scan/views";
import { SubScoreRow } from "./SubScoreRow";

const WEAKEST_FIRST = "Weakest first, so the top one is the best place to start.";
const WITH_GAPS =
  "Weakest first. Parts marked “Not counted yet” had no data, so they're left out, not counted as zero.";

function Numbers({ entries }: { entries: ScoreBreakdownEntry[] }) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Sub-scores in numbers</caption>
      <thead className="text-ink-muted">
        <tr className="border-b border-line">
          {["Sub-score", "Weight", "Score", "What Harbour recorded"].map((name) => (
            <th key={name} scope="col" className="py-1.5 pr-3 font-normal">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {entries.map((entry) => (
          <tr key={entry.key} className="align-top">
            <th scope="row" className="py-1.5 pr-3 font-mono font-normal">
              {entry.key}
            </th>
            <td className="py-1.5 pr-3 tabular-nums">{Math.round(entry.weight * 100)}%</td>
            <td className="py-1.5 pr-3 tabular-nums">{entry.score ?? "none"}</td>
            <td className="py-1.5">{entry.evidence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One area's sub-scores as plain sentences, weakest first, with the numbers, keys and raw
 * evidence under Technical details. Entries come from the stored breakdown, keyed "<area>.<name>".
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
  const { name, code } = AREAS[area];
  const own = weakestFirst(entries.filter((entry) => entry.key.startsWith(`${area}.`)));
  if (own.length === 0) {
    return (
      <EmptyState
        what={`The details behind ${name} will appear here.`}
        when="They appear after the first check finishes."
        why="Each one says what Harbour looked at and how your site did."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">{complete ? WEAKEST_FIRST : WITH_GAPS}</p>
      <ul className="divide-y divide-line">
        {own.map((entry) => (
          <SubScoreRow key={entry.key} entry={entry} />
        ))}
      </ul>
      <TechnicalDetails id={`breakdown-${area}`} topic={`${code} scores in numbers`}>
        <Panel className="overflow-x-auto px-3 py-2">
          <Numbers entries={own} />
        </Panel>
      </TechnicalDetails>
    </div>
  );
}
