import { checkTransition } from "@/lib/actions/transitions";
import { ACTION_STATUSES } from "@/lib/actions/types";
import { STATUS_COLUMN } from "@/lib/explain/actions";
import { ACTOR_LABEL, EMPTY_STATE, STATUS_CONTROLS, STATUS_FILTER_LABEL } from "./action-labels";

describe("STATUS_CONTROLS", () => {
  it("offers exactly the moves the server allows from each status", () => {
    for (const status of ACTION_STATUSES) {
      for (const { to } of STATUS_CONTROLS[status]) {
        const change = to === "snoozed" ? { to, until: "2026-10-05" } : { to };
        expect(checkTransition(status, change, "2026-10-02")).toBeNull();
      }
    }
  });

  it("words the buttons with the board's column names", () => {
    const labels = (status: (typeof ACTION_STATUSES)[number]) =>
      STATUS_CONTROLS[status].map((c) => c.label);
    expect(labels("suggested")).toEqual(["Accept", "Dismiss"]);
    expect(labels("open")).toEqual(["Start", "Mark done", "Snooze…", "Dismiss"]);
    expect(labels("in_progress")).toEqual([
      "Move back to To do",
      "Mark done",
      "Snooze…",
      "Dismiss",
    ]);
    expect(labels("snoozed")).toEqual(["Bring back now", "Mark done", "Dismiss"]);
    expect(labels("done")).toEqual(["Move back to To do"]);
    expect(labels("dismissed")).toEqual(["Restore to To do"]);
  });
});

describe("filter and empty-state wording", () => {
  it("names the status filter in the board's columns", () => {
    expect(STATUS_FILTER_LABEL).toEqual({
      active: "To do and in progress",
      suggested: STATUS_COLUMN.suggested,
      snoozed: STATUS_COLUMN.snoozed,
      done: STATUS_COLUMN.done,
      dismissed: STATUS_COLUMN.dismissed,
      all: "Everything",
    });
  });

  it("answers what, when and why for every empty filter", () => {
    for (const parts of Object.values(EMPTY_STATE)) {
      for (const text of Object.values(parts)) expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("calls the scan Harbour's scan in a card's history", () => {
    expect(ACTOR_LABEL.scan).toBe("Harbour's scan");
  });
});
