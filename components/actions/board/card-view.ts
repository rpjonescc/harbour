import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/actions/board-column";
import type { BoardCard } from "@/lib/actions/board-view";
import { lastMoveLine } from "@/lib/explain/board";
import type { Hue } from "@/lib/products/catalog";

/**
 * A board card as the browser gets it: the last move is already a sentence (worded on the server
 * against one clock) and the product colour is attached.
 */
export type BoardCardView = Omit<BoardCard, "lastMove"> & {
  hue: Hue;
  lastMoveText: string | null;
};

/** The card, ready for the client, or null when its product is not in `hues`. */
export function toCardView(
  card: BoardCard,
  hues: ReadonlyMap<string, Hue>,
  now: Date,
): BoardCardView | null {
  const hue = hues.get(card.productId);
  if (!hue) return null;
  const { lastMove, ...rest } = card;
  return { ...rest, hue, lastMoveText: lastMove ? lastMoveLine(lastMove, now) : null };
}

const emptyColumns = (): Record<BoardColumnId, BoardCardView[]> =>
  Object.fromEntries(BOARD_COLUMNS.map((id) => [id, [] as BoardCardView[]])) as Record<
    BoardColumnId,
    BoardCardView[]
  >;

/** Cards placed by column after the owner's pending moves; a moved card goes to the top. */
export function placeCards(
  columns: Readonly<Record<BoardColumnId, readonly BoardCardView[]>>,
  moved: Readonly<Record<number, BoardColumnId>>,
): Record<BoardColumnId, BoardCardView[]> {
  const arrived = emptyColumns();
  const stayed = emptyColumns();
  for (const card of Object.values(columns).flat()) {
    const to = moved[card.id];
    if (to) arrived[to].push(card);
    else if (card.column) stayed[card.column].push(card);
  }
  return Object.fromEntries(
    BOARD_COLUMNS.map((id) => [id, [...arrived[id], ...stayed[id]]]),
  ) as Record<BoardColumnId, BoardCardView[]>;
}

/** Column counts from the server, shifted by the moves still waiting for a refresh. */
export function shiftCounts(
  counts: Readonly<Record<BoardColumnId, number>>,
  columns: Readonly<Record<BoardColumnId, readonly BoardCardView[]>>,
  moved: Readonly<Record<number, BoardColumnId>>,
): Record<BoardColumnId, number> {
  const shifted = { ...counts };
  for (const card of Object.values(columns).flat()) {
    const to = moved[card.id];
    if (to === undefined || card.column === null || to === card.column) continue;
    shifted[card.column] -= 1;
    shifted[to] += 1;
  }
  return shifted;
}
