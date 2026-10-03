import { BOARD_COLUMNS, boardColumn, columnTarget } from "./board-column";
import type { ActionRow, ActionStage } from "./types";

const pr = "https://github.com/example/repo/pull/1";
type Row = Pick<ActionRow, "status" | "stage" | "prUrl">;
const row = (over: Partial<Row>): Row => ({ status: "open", stage: null, prUrl: null, ...over });

describe("boardColumn", () => {
  it.each<[string, Partial<Row>, string | null]>([
    ["suggested", { status: "suggested" }, "backlog"],
    ["open, no stage", {}, "backlog"],
    ["open, queue", { stage: "queue" }, "queue"],
    ["in progress, started", { status: "in_progress", stage: "started" }, "started"],
    ["in progress, no stage, no pull request", { status: "in_progress" }, "in_progress"],
    ["in progress, no stage, pull request", { status: "in_progress", prUrl: pr }, "in_review"],
    ["in progress, in_review stage", { status: "in_progress", stage: "in_review" }, "in_review"],
    [
      "stage beats the pull request",
      { status: "in_progress", stage: "started", prUrl: pr },
      "started",
    ],
    ["done", { status: "done" }, "done"],
    ["done with a pull request", { status: "done", prUrl: pr }, "done"],
    // No CHECK guards the stage column: a stray value reads as no stage, never undefined.
    ["open, unknown stage", { stage: "parked" as ActionStage }, "backlog"],
    [
      "in progress, unknown stage",
      { status: "in_progress", stage: "x" as ActionStage },
      "in_progress",
    ],
    [
      "in progress, unknown stage, pull request",
      { status: "in_progress", stage: "x" as ActionStage, prUrl: pr },
      "in_review",
    ],
    ["snoozed", { status: "snoozed" }, null],
    ["dismissed", { status: "dismissed" }, null],
  ])("%s", (_name, over, column) => {
    expect(boardColumn(row(over))).toBe(column);
  });
});

describe("columnTarget", () => {
  it("maps every column to the status and stage that boardColumn reads back as that column", () => {
    for (const column of BOARD_COLUMNS) {
      const { status, stage } = columnTarget(column);
      expect(boardColumn(row({ status, stage }))).toBe(column);
    }
  });

  it("uses the documented targets", () => {
    expect(columnTarget("backlog")).toEqual({ status: "open", stage: null });
    expect(columnTarget("queue")).toEqual({ status: "open", stage: "queue" });
    expect(columnTarget("started")).toEqual({ status: "in_progress", stage: "started" });
    expect(columnTarget("in_progress")).toEqual({ status: "in_progress", stage: null });
    expect(columnTarget("in_review")).toEqual({ status: "in_progress", stage: "in_review" });
    expect(columnTarget("done")).toEqual({ status: "done", stage: null });
  });
});
