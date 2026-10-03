import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/actions/board-column";
import type { Board as BoardData } from "@/lib/actions/board-view";
import { MAX_BOARD_ACTIONS } from "@/lib/actions/views";
import { BOARD_TEXT } from "@/lib/explain/board";
import type { Product } from "@/lib/products/catalog";
import { ActionAnnouncer } from "../ActionAnnouncer";
import { BoardLanes } from "./BoardLanes";
import { type BoardCardView, toCardView } from "./card-view";
import { ParkedStrip } from "./ParkedStrip";

/**
 * The actions board: six columns of cards the owner can drag or move with the Move to… menu,
 * a note when the card cap cut some off, and the Parked strip. Moves and status changes are
 * announced through one shared announcer. `demo` (the /design examples) sends nothing.
 */
export function Board({
  board,
  products,
  now,
  locale,
  today,
  demo = false,
}: {
  board: BoardData;
  products: readonly Pick<Product, "id" | "hue">[];
  /** The clock the last-move lines are worded against. */
  now: Date;
  locale: string;
  /** YYYY-MM-DD in HARBOUR_TIMEZONE, for the snooze range. */
  today: string;
  demo?: boolean;
}) {
  const hues = new Map(products.map((product) => [product.id, product.hue]));
  const views = (cards: BoardData["parked"]): BoardCardView[] =>
    cards.flatMap((card) => toCardView(card, hues, now) ?? []);
  const columns = Object.fromEntries(
    BOARD_COLUMNS.map((column) => [column, views(board.columns[column])]),
  ) as Record<BoardColumnId, BoardCardView[]>;
  return (
    <ActionAnnouncer>
      <div className="flex flex-col gap-8">
        {board.truncated && (
          <p className="text-sm text-ink-muted">{BOARD_TEXT.truncated(MAX_BOARD_ACTIONS)}</p>
        )}
        <BoardLanes columns={columns} counts={board.counts} today={today} demo={demo} />
        <ParkedStrip cards={views(board.parked)} locale={locale} today={today} demo={demo} />
      </div>
    </ActionAnnouncer>
  );
}
