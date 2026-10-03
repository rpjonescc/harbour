import { BOARD_COLUMNS } from "@/lib/actions/board-column";
import type { Board, BoardCard } from "@/lib/actions/board-view";

/** A fictional product for board tests. */
export const BOARD_PRODUCT = { id: "acme-docs", name: "Acme Docs", hue: "teal" } as const;

/** The fixed clock board tests word their last-move lines against. */
export const BOARD_NOW = new Date("2026-10-02T09:00:00Z");

/** A board card in Queue unless overridden: a plain open job with an owner move a day ago. */
export function boardCard(over: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 1,
    title: "Add a title to the pricing page",
    whyLine: "Search results show the address instead of a name.",
    productId: BOARD_PRODUCT.id,
    productName: BOARD_PRODUCT.name,
    area: "SEO",
    impact: "high",
    effort: "small",
    who: "you",
    column: "queue",
    prUrl: null,
    lastMove: { actor: "owner", to: "queue", at: new Date("2026-10-01T09:00:00Z") },
    stuck: false,
    needsOwner: false,
    isNewIdea: false,
    status: "open",
    snoozedUntil: null,
    ...over,
  };
}

/** A board holding `cards` (in their own columns, or parked when the column is null). */
export function boardOf(cards: BoardCard[], over: Partial<Board> = {}): Board {
  const columns = Object.fromEntries(
    BOARD_COLUMNS.map((id) => [id, cards.filter((card) => card.column === id)]),
  ) as Board["columns"];
  const counts = Object.fromEntries(
    BOARD_COLUMNS.map((id) => [id, columns[id].length]),
  ) as Board["counts"];
  const inColumns = cards.filter((card) => card.column !== null);
  return {
    columns,
    counts,
    focusCounts: {
      stuck: inColumns.filter((card) => card.stuck).length,
      "needs-you": inColumns.filter((card) => card.needsOwner).length,
    },
    parked: cards.filter((card) => card.column === null),
    truncated: false,
    ...over,
  };
}
