import type { ActionRow, ActionStage, ActionStatus } from "./types";

export type BoardColumnId = "backlog" | "queue" | "started" | "in_progress" | "in_review" | "done";

/** Board columns, left to right. */
export const BOARD_COLUMNS: readonly BoardColumnId[] = [
  "backlog",
  "queue",
  "started",
  "in_progress",
  "in_review",
  "done",
];

const STAGE_COLUMN: Record<ActionStage, BoardColumnId> = {
  queue: "queue",
  started: "started",
  in_review: "in_review",
};

/**
 * The only place that turns status, stage and pull request link into a board column.
 * Null for snoozed and dismissed, which are not columns.
 */
export function boardColumn(
  row: Pick<ActionRow, "status" | "stage" | "prUrl">,
): BoardColumnId | null {
  switch (row.status) {
    case "snoozed":
    case "dismissed":
      return null;
    case "done":
      return "done";
    case "suggested":
      return "backlog";
    case "open":
    case "in_progress":
      if (row.stage) return STAGE_COLUMN[row.stage];
      if (row.status === "open") return "backlog";
      return row.prUrl ? "in_review" : "in_progress";
  }
}

/** The status and stage a card gets when it is moved into a column. */
export function columnTarget(column: BoardColumnId): {
  status: Extract<ActionStatus, "open" | "in_progress" | "done">;
  stage: ActionStage | null;
} {
  switch (column) {
    case "backlog":
      return { status: "open", stage: null };
    case "queue":
      return { status: "open", stage: "queue" };
    case "started":
      return { status: "in_progress", stage: "started" };
    case "in_progress":
      return { status: "in_progress", stage: null };
    case "in_review":
      return { status: "in_progress", stage: "in_review" };
    case "done":
      return { status: "done", stage: null };
  }
}
