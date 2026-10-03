import { and, asc, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { ACTION_ACTORS, ACTIVE, type ActionActor, type ActionRow } from "./types";

const isActor = (value: unknown): value is ActionActor =>
  typeof value === "string" && (ACTION_ACTORS as readonly string[]).includes(value);

/**
 * Who made the action's latest status change: its creation and board moves count, a PR link (an
 * event from a status and stage to themselves) does not. Raw SQL on purpose: Drizzle renders columns unqualified inside a
 * subquery, so `${actions.id}` would bind to action_events.id instead of the outer action.
 */
const statusActor = sql<string | null>`(
  SELECT e.actor FROM action_events AS e
  WHERE e.action_id = "actions"."id"
    AND (e.from_status IS NULL OR e.from_status <> e.to_status OR e.from_stage IS NOT e.to_stage)
  ORDER BY e.id DESC LIMIT 1
)`;

/** An active action as Today counts it. */
export type ActiveWork = Pick<ActionRow, "id" | "productId" | "area" | "prUrl" | "stage"> & {
  status: "open" | "in_progress";
  /** Null when pruning removed every status change: unknown, never guessed. */
  statusActor: ActionActor | null;
};

/** Every open or in-progress action of the configured products, oldest first, with who last moved it. */
export function activeWork(db: Db, productIds: readonly string[]): ActiveWork[] {
  if (productIds.length === 0) return [];
  const rows = db
    .select({
      id: actions.id,
      productId: actions.productId,
      area: actions.area,
      status: actions.status,
      prUrl: actions.prUrl,
      stage: actions.stage,
      statusActor,
    })
    .from(actions)
    .where(and(inArray(actions.productId, [...productIds]), inArray(actions.status, [...ACTIVE])))
    .orderBy(asc(actions.id))
    .all();
  return rows.flatMap((row) =>
    row.status === "open" || row.status === "in_progress"
      ? [
          {
            ...row,
            status: row.status,
            statusActor: isActor(row.statusActor) ? row.statusActor : null,
          },
        ]
      : [],
  );
}
