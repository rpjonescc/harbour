import { and, eq, lte, not, or, type SQL, sql } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { STUCK_DAYS } from "@/lib/explain/board";
import { statusActorSql } from "./active-work";
import { inBoardColumns } from "./board-column-sql";

const DAY_MS = 24 * 3_600_000;

/**
 * Stuck as a WHERE clause (`isStuck` in board-view.ts): whole days since the last change strictly
 * over the column's limit, which is at least limit + 1 days.
 */
export function stuckWhere(now: Date): SQL | undefined {
  return or(
    ...(Object.keys(STUCK_DAYS) as (keyof typeof STUCK_DAYS)[]).map((column) =>
      and(
        inBoardColumns([column]),
        lte(actions.statusChangedAt, new Date(now.getTime() - (STUCK_DAYS[column] + 1) * DAY_MS)),
      ),
    ),
  );
}

/** Work Claude is on: in progress, no pull request, and Claude made the latest status change. */
const claudesWork = sql`(${actions.status} = 'in_progress' AND ${actions.prUrl} IS NULL AND ${statusActorSql} = 'claude')`;

/**
 * Needs you as a WHERE clause (`needsOwner` in board-view.ts): a new idea, anything In review, and
 * Started or In progress work that Claude is not on. Keep the two in step: board-focus.test.ts
 * checks them against each other.
 */
export function needsYouWhere(): SQL | undefined {
  return or(
    eq(actions.status, "suggested"),
    inBoardColumns(["in_review"]),
    and(inBoardColumns(["started", "in_progress"]), not(claudesWork)),
  );
}
