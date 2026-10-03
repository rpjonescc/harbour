import { and, eq, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import type { BoardColumnId } from "./board-column";

const STAGED = inArray(actions.status, ["open", "in_progress"]);

/**
 * `boardColumn` as a WHERE clause, so a column can be listed with a bound query. Keep the two in
 * step: cli/move.test.ts checks every status, stage and pull request combination against it.
 */
const COLUMN_WHERE: Record<BoardColumnId, () => SQL | undefined> = {
  backlog: () =>
    or(eq(actions.status, "suggested"), and(eq(actions.status, "open"), isNull(actions.stage))),
  queue: () => and(STAGED, eq(actions.stage, "queue")),
  started: () => and(STAGED, eq(actions.stage, "started")),
  in_progress: () =>
    and(eq(actions.status, "in_progress"), isNull(actions.stage), isNull(actions.prUrl)),
  in_review: () =>
    or(
      and(STAGED, eq(actions.stage, "in_review")),
      and(eq(actions.status, "in_progress"), isNull(actions.stage), isNotNull(actions.prUrl)),
    ),
  done: () => eq(actions.status, "done"),
};

/** Rows whose board column is one of `columns`; parked rows (snoozed, dismissed) never match. */
export function inBoardColumns(columns: readonly BoardColumnId[]): SQL | undefined {
  return or(...columns.map((column) => COLUMN_WHERE[column]()));
}
