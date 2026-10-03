import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import type { RuleOutcome } from "@/lib/scan/issues";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { boardColumn } from "./board-column";
import { syncRuleActions } from "./rule-sync-store";
import { applyStatusChange } from "./status-change";
import { actionEventsFor, insertAction, setStatus, wakeDueSnoozes } from "./store";
import type { StatusChange } from "./transitions";
import type { ActionStage, ActionStatus } from "./types";

// Every status change that is not a board move takes the card out of its stage, and its event
// says which stage it left.

const t0 = new Date("2026-10-02T09:00:00Z");
const today = "2026-10-02";

function seed(db: Db, status: ActionStatus, stage: ActionStage | null, ruleKey = "rule-1") {
  return insertAction(db, ruleAction({ ruleKey, status, stage }), "scan", null, t0);
}
const rowOf = (db: Db, id: number) => db.select().from(actions).where(eq(actions.id, id)).get();
const lastEvent = (db: Db, id: number) => actionEventsFor(db, id).at(-1);

function change(db: Db, id: number, from: ActionStatus, to: StatusChange) {
  return applyStatusChange(db, {
    id,
    from,
    change: to,
    actor: "owner",
    login: "owner@example.com",
    productIds: ["acme-docs"],
    today,
    now: t0,
  });
}

describe("stage on status changes outside the board", () => {
  it("records the stage a new action starts in on its creation event", () => {
    const db = openTestDb();
    const id = seed(db, "open", "queue");
    expect(lastEvent(db, id)).toMatchObject({ from: null, fromStage: null, toStage: "queue" });
  });

  it.each([
    ["done", "in_progress", "in_review", { to: "done" }],
    ["snooze", "open", "queue", { to: "snoozed", until: "2026-10-09" }],
    ["dismiss", "in_progress", "started", { to: "dismissed" }],
    ["back to open", "in_progress", "started", { to: "open" }],
  ] as const)(
    "clears the stage on %s, and the event names the stage left",
    (_label, from, stage, to) => {
      const db = openTestDb();
      const id = seed(db, from, stage);
      expect(change(db, id, from, to)).toMatchObject({ ok: true });
      expect(rowOf(db, id)?.stage).toBeNull();
      expect(lastEvent(db, id)).toMatchObject({ from, to: to.to, fromStage: stage, toStage: null });
    },
  );

  it("reopens a done card into Backlog", () => {
    const db = openTestDb();
    const id = seed(db, "done", null);
    expect(change(db, id, "done", { to: "open" })).toMatchObject({ ok: true });
    const row = rowOf(db, id);
    expect(row && boardColumn(row)).toBe("backlog");
    expect(lastEvent(db, id)).toMatchObject({ fromStage: null, toStage: null });
  });

  it("wakes a snooze into Backlog with no stage", () => {
    const db = openTestDb();
    const id = seed(db, "open", "queue");
    setStatus(db, id, "open", "snoozed", { actor: "owner", snoozedUntil: today, now: t0 });
    expect(wakeDueSnoozes(db, today, t0)).toBe(1);
    expect(rowOf(db, id)).toMatchObject({ status: "open", stage: null });
    expect(lastEvent(db, id)).toMatchObject({ fromStage: null, toStage: null });
  });

  it("sets the stage only when the caller gives one", () => {
    const db = openTestDb();
    const id = seed(db, "open", null);
    setStatus(db, id, "open", "in_progress", { actor: "owner", stage: "started", now: t0 });
    expect(rowOf(db, id)?.stage).toBe("started");
    expect(lastEvent(db, id)).toMatchObject({ fromStage: null, toStage: "started" });
  });
});

describe("rule sync and the stage", () => {
  const outcome = (state: "present" | "clear"): RuleOutcome =>
    state === "clear"
      ? { ruleId: "rule-1", state }
      : {
          ruleId: "rule-1",
          state,
          issue: {
            id: "rule-1",
            area: "SEO",
            impact: "high",
            title: "2 pages have no title",
            problem: "These pages have no <title>.",
            fix: "Give each page a title.",
            check: "Each listed URL serves a <title>.",
            locations: ["https://docs.example.com/a"],
            total: 1,
            effort: "small",
            docs: [],
          },
        };
  const sync = (db: Db, state: "present" | "clear") =>
    syncRuleActions(db, {
      productId: "acme-docs",
      outcomes: [outcome(state)],
      scanDate: today,
      now: t0,
    });

  it("resolves a card in a stage to Done and clears the stage", () => {
    const db = openTestDb();
    const id = seed(db, "in_progress", "in_review");
    expect(sync(db, "clear")).toMatchObject({ resolved: 1 });
    expect(rowOf(db, id)).toMatchObject({ status: "done", stage: null });
    expect(lastEvent(db, id)).toMatchObject({ fromStage: "in_review", toStage: null });
  });

  it("reopens a done card back into Backlog, whatever stage it held", () => {
    const db = openTestDb();
    const id = seed(db, "done", null);
    // A stage left on a done row (written before this rule existed) must not survive reopening.
    db.update(actions).set({ stage: "queue" }).where(eq(actions.id, id)).run();
    expect(sync(db, "present")).toMatchObject({ reopened: 1 });
    const row = rowOf(db, id);
    expect(row).toMatchObject({ status: "open", stage: null });
    expect(row && boardColumn(row)).toBe("backlog");
    expect(lastEvent(db, id)).toMatchObject({ actor: "scan", fromStage: "queue", toStage: null });
  });
});
