import { STRIP_TEXT } from "@/lib/explain/board";
import type { WorkStrip } from "@/lib/today/work-strip";

const FILL: Record<WorkStrip["tiles"][number]["column"], string> = {
  backlog: "bg-surface-sunk text-ink",
  queue: "bg-accent-soft text-ink",
  started: "bg-accent-soft text-ink",
  in_progress: "bg-accent-soft text-ink",
  in_review: "bg-warn-soft text-ink",
  done: "bg-accent text-accent-ink",
};

/**
 * The share of cards in each column as one bar. Each segment grows with its count and carries its
 * own text (name and number), so colour is never the only signal. The tiles above hold the links,
 * so the bar is hidden from assistive technology rather than read twice. On a phone the segments
 * wrap onto a second row rather than clip the last one.
 */
export function FlowBar({ tiles }: { tiles: WorkStrip["tiles"] }) {
  return (
    <ol
      aria-hidden="true"
      data-testid="flow-bar"
      className="strip-grow flex flex-wrap gap-0.5 overflow-hidden rounded-md border border-line"
    >
      {tiles.map((tile) => (
        <li
          key={tile.column}
          data-segment={tile.column}
          style={{ flexGrow: tile.count }}
          className={`flex min-w-fit flex-col px-2 py-1 text-2xs ${FILL[tile.column]}`}
        >
          <span className="whitespace-nowrap">{tile.name}</span>
          <span className="tabular-nums">{STRIP_TEXT.cards(tile.count)}</span>
        </li>
      ))}
    </ol>
  );
}
