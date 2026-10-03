"use client";

import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/actions/board-column";
import { BoardCard } from "./BoardCard";
import { BoardColumn } from "./BoardColumn";
import type { BoardCardView } from "./card-view";
import { useBoardDrag } from "./useBoardDrag";
import { useBoardMoves } from "./useBoardMoves";

/**
 * The six columns side by side (scrolling sideways on narrow screens), with drag and drop and each
 * card's Move to… menu wired to the same move.
 */
export function BoardLanes({
  columns,
  counts,
  today,
  demo,
}: {
  columns: Readonly<Record<BoardColumnId, readonly BoardCardView[]>>;
  counts: Readonly<Record<BoardColumnId, number>>;
  today: string;
  demo: boolean;
}) {
  const moves = useBoardMoves({ columns, counts, demo });
  const drag = useBoardDrag(moves.drop, columns);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {BOARD_COLUMNS.map((column) => (
        <BoardColumn
          key={column}
          column={column}
          count={moves.counts[column]}
          over={drag.over === column}
          zone={drag.zone(column)}
        >
          {moves.placed[column].map((card) => (
            <li key={card.id}>
              <BoardCard
                card={card}
                column={column}
                arrived={moves.arrived === card.id}
                drag={drag.card(card.id)}
                onMove={(to) => void moves.move(card, to)}
                today={today}
                demo={demo}
              />
            </li>
          ))}
        </BoardColumn>
      ))}
    </div>
  );
}
