import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import type { ActionRow, ActionStatus } from "../types";

/** Most actions one `list` prints; the rest are counted. */
export const MAX_LISTED = 500;

/** Matching actions, oldest first, at most MAX_LISTED, and how many matched in all. */
export function listActions(
  db: Db,
  productIds: readonly string[],
  statuses: readonly ActionStatus[],
): { rows: ActionRow[]; total: number } {
  if (productIds.length === 0 || statuses.length === 0) return { rows: [], total: 0 };
  const where = and(
    inArray(actions.productId, [...productIds]),
    inArray(actions.status, [...statuses]),
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
