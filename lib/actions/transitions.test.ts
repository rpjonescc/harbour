import { checkTransition } from "./transitions";
import type { ActionStatus } from "./types";

const TODAY = "2026-10-02";
const STATUSES: ActionStatus[] = [
  "suggested",
  "open",
  "in_progress",
  "done",
  "snoozed",
  "dismissed",
];
const TARGETS = ["open", "in_progress", "done", "snoozed", "dismissed"] as const;

const ALLOWED: Record<ActionStatus, readonly string[]> = {
  suggested: ["open", "dismissed"],
  open: ["in_progress", "done", "snoozed", "dismissed"],
  in_progress: ["open", "done", "snoozed", "dismissed"],
  snoozed: ["open", "done", "dismissed"],
  done: ["open"],
  dismissed: ["open"],
};

describe("checkTransition", () => {
  for (const from of STATUSES) {
    for (const to of TARGETS) {
      const allowed = ALLOWED[from].includes(to);
      it(`${from} → ${to} is ${allowed ? "allowed" : "refused"}`, () => {
        const change = to === "snoozed" ? { to, until: "2026-10-09" } : { to };
        expect(checkTransition(from, change, TODAY)).toBe(allowed ? null : "not_allowed");
      });
    }
  }

  it("requires a date to snooze", () => {
    expect(checkTransition("open", { to: "snoozed" }, TODAY)).toBe("until_required");
  });

  it("accepts tomorrow and exactly 365 days ahead", () => {
    expect(checkTransition("open", { to: "snoozed", until: "2026-10-03" }, TODAY)).toBeNull();
    expect(checkTransition("open", { to: "snoozed", until: "2027-10-02" }, TODAY)).toBeNull();
  });

  it.each([
    ["today", "2026-10-02"],
    ["the past", "2026-09-30"],
    ["more than 365 days ahead", "2027-10-03"],
    ["a malformed date", "2026-1-9"],
    ["an impossible date", "2026-02-30"],
    ["a date with a time", "2026-10-09T00:00"],
  ])("refuses a snooze until %s", (_label, until) => {
    expect(checkTransition("open", { to: "snoozed", until }, TODAY)).toBe("until_invalid");
  });

  it("refuses a date on anything but a snooze", () => {
    expect(checkTransition("open", { to: "done", until: "2026-10-09" }, TODAY)).toBe(
      "until_invalid",
    );
  });

  it("checks the table before the date", () => {
    expect(checkTransition("done", { to: "snoozed" }, TODAY)).toBe("not_allowed");
  });
});
