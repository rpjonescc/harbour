import { and, asc, count, eq, gte, inArray, or, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions } from "@/lib/db/schema";
import { type WhoOnIt, whoIsOnIt } from "@/lib/explain/actions";
import { STUCK_DAYS } from "@/lib/explain/board";
import { getProducts, type Product } from "@/lib/products/catalog";
import type { Impact } from "@/lib/scan/issues";
import { firstSentence } from "@/lib/today/reason";
import { BOARD_COLUMNS, type BoardColumnId, boardColumn } from "./board-column";
import { inBoardColumns } from "./board-column-sql";
import { needsYouWhere, stuckWhere } from "./board-focus-sql";
import { latestStatusChange } from "./status-actor";
import { ACTION_STATUSES, type ActionActor, type ActionRow, type ActionStatus } from "./types";
import { type ActionFilter, impactRank, MAX_BOARD_ACTIONS } from "./views";

/** Done cards (and dismissed ones in Parked) stay on the board this many days. */
export const DONE_DAYS = 14;
const DAY_MS = 24 * 3_600_000;

export type BoardFocus = "stuck" | "needs-you";
const FOCUSES: readonly BoardFocus[] = ["stuck", "needs-you"];

/** The board's filters: product and area as on the list, plus the Today strip's `focus`. */
export type BoardFilter = Pick<ActionFilter, "productId" | "area"> & {
  focus?: BoardFocus | null;
};

/** `?focus=stuck|needs-you` from URL search params; anything else is no focus. */
export function parseBoardFocus(value: string | string[] | undefined): BoardFocus | null {
  return FOCUSES.find((focus) => focus === value) ?? null;
}

/** The /actions page's two views; the board is the default. */
export type ActionsView = "board" | "list";

/** `?view=board|list` from URL search params; anything else is the board. */
export function parseActionsView(value: string | string[] | undefined): ActionsView {
  return value === "list" ? "list" : "board";
}

export type BoardCard = {
  id: number;
  title: string;
  /** First sentence of why it matters. */
  whyLine: string;
  productId: string;
  productName: string;
  area: ActionRow["area"];
  impact: Impact;
  effort: ActionRow["effort"];
  who: WhoOnIt | null;
  /** Null for a parked card (snoozed or dismissed), which sits in no column. */
  column: BoardColumnId | null;
  prUrl: string | null;
  /** The latest status or column change (`added`: the card's creation); null when pruned or parked. */
  lastMove: { actor: ActionActor; to: BoardColumnId; at: Date; added: boolean } | null;
  /** Stood still longer than STUCK_DAYS for its column. */
  stuck: boolean;
  /** A new idea to decide, a card In review waiting for a look, or work that is the owner's. */
  needsOwner: boolean;
  isNewIdea: boolean;
  /** Parked cards need these for Wake and Bring back. */
  status: ActionStatus;
  snoozedUntil: string | null;
};

export type Board = {
  columns: Record<BoardColumnId, BoardCard[]>;
  /** Snoozed cards, and dismissed ones from the last 14 days. */
  parked: BoardCard[];
  /** Cards in each column for the filters, ignoring `focus` and the card cap. */
  counts: Record<BoardColumnId, number>;
  /** Stuck cards and cards that need the owner for the filters, ignoring `focus` and the cap. */
  focusCounts: Record<BoardFocus, number>;
  /** More cards match than the board shows. */
  truncated: boolean;
};

type EventRow = Pick<
  typeof actionEvents.$inferSelect,
  "at" | "actor" | "from" | "to" | "fromStage" | "toStage"
>;

const emptyColumns = <T>(make: () => T) =>
  Object.fromEntries(BOARD_COLUMNS.map((id) => [id, make()])) as Record<BoardColumnId, T>;

const isStatus = (value: string): value is ActionStatus =>
  (ACTION_STATUSES as readonly string[]).includes(value);

function eventsOf(db: Db, ids: number[]): Map<number, EventRow[]> {
  const byAction = new Map<number, EventRow[]>();
  if (ids.length === 0) return byAction;
  const rows = db
    .select({
      actionId: actionEvents.actionId,
      at: actionEvents.at,
      actor: actionEvents.actor,
      from: actionEvents.from,
      to: actionEvents.to,
      fromStage: actionEvents.fromStage,
      toStage: actionEvents.toStage,
    })
    .from(actionEvents)
    .where(inArray(actionEvents.actionId, ids))
    .orderBy(asc(actionEvents.id))
    .all();
  for (const { actionId, ...event } of rows) {
    byAction.set(actionId, [...(byAction.get(actionId) ?? []), event]);
  }
  return byAction;
}

/** The column a move event put the card in; the card's own link decides when it is the latest. */
function moveTarget(event: EventRow, row: ActionRow): BoardColumnId | null {
  if (!isStatus(event.to)) return null;
  const isCurrent = event.to === row.status && event.toStage === row.stage;
  return boardColumn({
    status: event.to,
    stage: event.toStage,
    prUrl: isCurrent ? row.prUrl : null,
  });
}

function isStuck(column: BoardColumnId | null, row: ActionRow, now: Date): boolean {
  if (column !== "started" && column !== "in_progress" && column !== "in_review") return false;
  const days = Math.floor((now.getTime() - row.statusChangedAt.getTime()) / DAY_MS);
  return days > STUCK_DAYS[column];
}

function needsOwner(who: WhoOnIt | null, column: BoardColumnId | null): boolean {
  if (who === "undecided" || who === "pr_waiting" || who === "review_waiting") return true;
  // Backlog and Queue cards read "waiting for you" too, but nothing is due there yet.
  return (
    who === "you" && (column === "started" || column === "in_progress" || column === "in_review")
  );
}

function toCard(
  row: ActionRow,
  history: readonly EventRow[],
  product: Pick<Product, "name">,
  now: Date,
): BoardCard {
  const column = boardColumn(row);
  const move = latestStatusChange(history);
  const to = move && column !== null ? moveTarget(move, row) : null;
  const who = whoIsOnIt({ ...row, statusActor: move?.actor ?? null });
  return {
    id: row.id,
    title: row.title,
    whyLine: firstSentence(row.why),
    productId: row.productId,
    productName: product.name,
    area: row.area,
    impact: row.impact,
    effort: row.effort,
    who,
    column,
    prUrl: row.prUrl,
    lastMove: move && to ? { actor: move.actor, to, at: move.at, added: move.from === null } : null,
    stuck: isStuck(column, row, now),
    needsOwner: needsOwner(who, column),
    isNewIdea: row.status === "suggested",
    status: row.status,
    snoozedUntil: row.snoozedUntil,
  };
}

/** The filters every query shares: configured products, product, area. */
function scope(filter: BoardFilter, productIds: readonly string[]): SQL | undefined {
  const ids =
    filter.productId === null ? productIds : productIds.filter((id) => id === filter.productId);
  return and(
    inArray(actions.productId, [...ids]),
    filter.area === null ? undefined : eq(actions.area, filter.area),
  );
}

/** Done only from the last 14 days, so the column stays short. */
const recentDone = (now: Date) =>
  and(
    eq(actions.status, "done"),
    gte(actions.statusChangedAt, new Date(now.getTime() - DONE_DAYS * DAY_MS)),
  );

/** Everything the board shows in a column: not parked, and Done limited to the last 14 days. */
const onBoard = (now: Date) =>
  or(inBoardColumns(BOARD_COLUMNS.filter((c) => c !== "done")), recentDone(now));

const parkedWhere = (now: Date) =>
  or(
    eq(actions.status, "snoozed"),
    and(
      eq(actions.status, "dismissed"),
      gte(actions.statusChangedAt, new Date(now.getTime() - DONE_DAYS * DAY_MS)),
    ),
  );

function fetchRows(db: Db, where: SQL | undefined, limit: number): ActionRow[] {
  if (limit < 1) return [];
  return db
    .select()
    .from(actions)
    .where(where)
    .orderBy(impactRank, asc(actions.createdAt), asc(actions.id))
    .limit(limit)
    .all();
}

function total(db: Db, where: SQL | undefined): number {
  return db.select({ n: count() }).from(actions).where(where).get()?.n ?? 0;
}

function columnCounts(db: Db, base: SQL | undefined, now: Date): Record<BoardColumnId, number> {
  const counts = emptyColumns(() => 0);
  for (const id of BOARD_COLUMNS) {
    const own = id === "done" ? recentDone(now) : inBoardColumns([id]);
    counts[id] = total(db, and(base, own));
  }
  return counts;
}

const focusWhere = (focus: BoardFocus | null | undefined, now: Date) =>
  focus === "stuck" ? stuckWhere(now) : focus === "needs-you" ? needsYouWhere() : undefined;

const keep = (focus: BoardFocus | null | undefined) => (card: BoardCard) =>
  focus === "stuck" ? card.stuck : focus === "needs-you" ? card.needsOwner : true;

/**
 * The board for the product and area filters: cards by column (impact high to low, oldest first),
 * the parked ones, true column and focus counts, and whether the 200-card cap cut some off.
 * `focus` narrows the columns to stuck cards or ones that need the owner, for the Today strip's
 * links; it narrows the query, so the cap counts only those cards.
 * Cards of products that are not configured are skipped.
 */
export function loadBoard(
  db: Db,
  filter: BoardFilter,
  now: Date,
  products: readonly Pick<Product, "id" | "name">[] = getProducts(),
): Board {
  const names = new Map(products.map((p) => [p.id, p]));
  const base = scope(filter, [...names.keys()]);
  const counts = columnCounts(db, base, now);
  const onBoardNow = and(base, onBoard(now));
  const focusCounts = {
    stuck: total(db, and(onBoardNow, stuckWhere(now))),
    "needs-you": total(db, and(onBoardNow, needsYouWhere())),
  };
  const boardWhere = and(onBoardNow, focusWhere(filter.focus, now));
  const rows = fetchRows(db, boardWhere, MAX_BOARD_ACTIONS);
  const parkedRows = filter.focus
    ? []
    : fetchRows(db, and(base, parkedWhere(now)), MAX_BOARD_ACTIONS - rows.length);
  const all = [...rows, ...parkedRows];
  const events = eventsOf(
    db,
    all.map((row) => row.id),
  );
  const cards = all.flatMap((row) => {
    const product = names.get(row.productId);
    return product ? [toCard(row, events.get(row.id) ?? [], product, now)] : [];
  });
  const columns = emptyColumns<BoardCard[]>(() => []);
  const parked: BoardCard[] = [];
  for (const card of cards.filter(keep(filter.focus))) {
    if (card.column === null) parked.push(card);
    else columns[card.column].push(card);
  }
  const parkedTotal = filter.focus ? 0 : total(db, and(base, parkedWhere(now)));
  return {
    columns,
    parked,
    counts,
    focusCounts,
    truncated: total(db, boardWhere) > rows.length || parkedTotal > parkedRows.length,
  };
}
