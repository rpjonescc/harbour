import { and, eq, inArray, isNotNull, isNull, notInArray, or, type SQL } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import type { BoardColumnId } from "./board-column";
import { ACTION_STAGES } from "./types";

const STAGED = inArray(actions.status, ["open", "in_progress"]);
/** No stage, or a stray value no CHECK stopped: both read as no stage, as in `boardColumn`. */
const NO_STAGE = or(isNull(actions.stage), notInArray(actions.stage, [...ACTION_STAGES]));

/**
 * `boardColumn` as a WHERE clause, so a column can be listed with a bound query. Keep the two in
 * step: cli/move.test.ts checks every status, stage and pull request combination against it.
 */
const COLUMN_WHERE: Record<BoardColumnId, () => SQL | undefined> = {
  backlog: () => or(eq(actions.status, "suggested"), and(eq(actions.status, "open"), NO_STAGE)),
  queue: () => and(STAGED, eq(actions.stage, "queue")),
  started: () => and(STAGED, eq(actions.stage, "started")),
  in_progress: () => and(eq(actions.status, "in_progress"), NO_STAGE, isNull(actions.prUrl)),
  in_review: () =>
    or(
      and(STAGED, eq(actions.stage, "in_review")),
      and(eq(actions.status, "in_progress"), NO_STAGE, isNotNull(actions.prUrl)),
    ),
  done: () => eq(actions.status, "done"),
};

/** Rows whose board column is one of `columns`; parked rows (snoozed, dismissed) never match. */
export function inBoardColumns(columns: readonly BoardColumnId[]): SQL | undefined {
  return or(...columns.map((column) => COLUMN_WHERE[column]()));
}
