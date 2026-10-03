import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { BOARD_COLUMNS, type BoardColumnId, boardColumn } from "@/lib/actions/board-column";
import { loadBoard } from "@/lib/actions/board-view";
import { latestStatusChange } from "@/lib/actions/status-actor";
import { ACTION_STATUSES, type ActionActor, type ActionStatus } from "@/lib/actions/types";
import { getConfig } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions } from "@/lib/db/schema";
import { COLUMN_COPY, movedTodayLine } from "@/lib/explain/board";
import { localMoment, zonedInstant } from "@/lib/format/zoned-time";
import { getProducts, type Product } from "@/lib/products/catalog";

const MOVE_SCAN_LIMIT = 200;

export type WorkStrip = {
  tiles: { column: BoardColumnId; name: string; count: number; href: string }[];
  stuck: { count: number; href: string };
  needsYou: { count: number; href: string };
  movedToday: { count: number; lastLine: string | null };
};

const BOARD_HREF = "/actions?view=board";

const isStatus = (value: string): value is ActionStatus =>
  (ACTION_STATUSES as readonly string[]).includes(value);

/** The card moves since local midnight (creation is not a move), newest first. */
function movesToday(db: Db, since: Date, productIds: string[]) {
  const rows = db
    .select({
      actionId: actionEvents.actionId,
      actor: actionEvents.actor,
      from: actionEvents.from,
      to: actionEvents.to,
      fromStage: actionEvents.fromStage,
      toStage: actionEvents.toStage,
      title: actions.title,
      status: actions.status,
      stage: actions.stage,
      prUrl: actions.prUrl,
    })
    .from(actionEvents)
    .innerJoin(actions, eq(actions.id, actionEvents.actionId))
    .where(and(gte(actionEvents.at, since), inArray(actions.productId, productIds)))
    .orderBy(desc(actionEvents.id))
    .limit(MOVE_SCAN_LIMIT)
    .all();
  return rows.filter((row) => row.from !== null && latestStatusChange([row]) !== null);
}

function movedToday(db: Db, now: Date, timeZone: string, productIds: string[]) {
  const midnight = zonedInstant(localMoment(timeZone, now).day, 0, timeZone);
  const moves = movesToday(db, midnight, productIds);
  const [last] = moves;
  if (!last) return { count: 0, lastLine: null };
  const isCurrent = last.to === last.status && last.toStage === last.stage;
  const to = isStatus(last.to)
    ? boardColumn({ status: last.to, stage: last.toStage, prUrl: isCurrent ? last.prUrl : null })
    : null;
  return {
    count: new Set(moves.map((m) => m.actionId)).size,
    lastLine: movedTodayLine({ actor: last.actor as ActionActor, title: last.title, to }),
  };
}

/**
 * The Today "Where the work is" band: true column counts, how many cards are stuck or need the
 * owner (the tower's own "Needs you" lists them), and what moved since midnight in `timeZone`.
 */
export function loadWorkStrip(
  db: Db,
  now: Date,
  timeZone: string = getConfig().HARBOUR_TIMEZONE,
  products: readonly Pick<Product, "id" | "name">[] = getProducts(),
): WorkStrip {
  // Focused, so the query loads only the few cards that need the owner; the counts stay true totals.
  const board = loadBoard(db, { productId: null, area: null, focus: "needs-you" }, now, products);
  return {
    tiles: BOARD_COLUMNS.map((column) => ({
      column,
      name: COLUMN_COPY[column].name,
      count: board.counts[column],
      href: BOARD_HREF,
    })),
    stuck: { count: board.focusCounts.stuck, href: `${BOARD_HREF}&focus=stuck` },
    needsYou: { count: board.focusCounts["needs-you"], href: `${BOARD_HREF}&focus=needs-you` },
    movedToday: movedToday(
      db,
      now,
      timeZone,
      products.map((p) => p.id),
    ),
  };
}
