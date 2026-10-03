import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import type { BoardColumnId } from "../board-column";
import { inBoardColumns } from "../board-column-sql";
import type { ActionRow, ActionStatus } from "../types";

/** Most actions one `list` prints; the rest are counted. */
export const MAX_LISTED = 500;

/** Which actions `list` matches: by status, or by board column. */
export type ListWhere =
  | { statuses: readonly ActionStatus[] }
  | { columns: readonly BoardColumnId[] };

/** Matching actions, oldest first, at most MAX_LISTED, and how many matched in all. */
export function listActions(
  db: Db,
  productIds: readonly string[],
  match: ListWhere,
): { rows: ActionRow[]; total: number } {
  const wanted = "statuses" in match ? match.statuses : match.columns;
  if (productIds.length === 0 || wanted.length === 0) return { rows: [], total: 0 };
  const where = and(
    inArray(actions.productId, [...productIds]),
    "statuses" in match
      ? inArray(actions.status, [...match.statuses])
      : inBoardColumns(match.columns),
  );
  const rows = db
    .select()
    .from(actions)
    .where(where)
    .orderBy(asc(actions.id))
    .limit(MAX_LISTED)
    .all();
  if (rows.length < MAX_LISTED) return { rows, total: rows.length };
  return {
    rows,
    total: db.select({ n: count() }).from(actions).where(where).get()?.n ?? rows.length,
  };
}

/** One action of a configured product; undefined otherwise. */
export function findAction(
  db: Db,
  id: number,
  productIds: readonly string[],
): ActionRow | undefined {
  const row = db.select().from(actions).where(eq(actions.id, id)).get();
  return row && productIds.includes(row.productId) ? row : undefined;
}
