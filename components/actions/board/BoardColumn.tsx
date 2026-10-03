import type { ReactNode } from "react";
import { Explainer } from "@/components/explain/Explainer";
import type { BoardColumnId } from "@/lib/actions/board-column";
import { BOARD_TEXT, COLUMN_COPY, explainerItems } from "@/lib/explain/board";
import { columnHeadingId } from "../focus-after-change";
import { COLUMN_ICON } from "./column-icons";
import type { ZoneDragProps } from "./useBoardDrag";

/**
 * One board column: a named region ("Queue, 3 cards") with its icon, name, count and
 * "What's this?", over a list of cards that is also a drop zone. `over` is the drag hover state.
 */
export function BoardColumn({
  column,
  count,
  over,
  zone,
  children,
}: {
  column: BoardColumnId;
  count: number;
  over: boolean;
  zone: ZoneDragProps;
  /** The cards, each already wrapped in an `<li>`. */
  children: ReactNode[];
}) {
  const copy = COLUMN_COPY[column];
  const Icon = COLUMN_ICON[column];
  const headingId = columnHeadingId(column);
  return (
    <section
      aria-label={BOARD_TEXT.columnLabel(column, count)}
      data-column={column}
      className="flex w-72 shrink-0 snap-start scroll-ml-4 flex-col min-[1600px]:w-auto min-[1600px]:min-w-0 min-[1600px]:flex-1 gap-3 rounded-md bg-surface-sunk p-3"
    >
      <header className="flex flex-col gap-1">
        <h2 id={headingId} tabIndex={-1} className="flex items-center gap-2 font-medium text-ink">
          <Icon aria-hidden="true" className="size-4 text-ink-muted" />
          <span>{copy.name}</span>
          <span className="rounded-full bg-surface px-2 text-xs text-ink-muted tabular-nums">
            {count}
          </span>
        </h2>
        <Explainer topic={copy.name} oneLiner={copy.short} items={explainerItems(copy.explainer)} />
      </header>
      <ul
        data-over={over || undefined}
        className="flex min-h-24 flex-1 flex-col gap-2 rounded-md outline-2 outline-transparent transition-colors duration-150 data-over:bg-accent-soft data-over:outline-dashed data-over:outline-accent"
        {...zone}
      >
        {children.length === 0 ? (
          <li className="text-sm text-ink-muted">{BOARD_TEXT.emptyColumn}</li>
        ) : (
          children
        )}
      </ul>
    </section>
  );
}
