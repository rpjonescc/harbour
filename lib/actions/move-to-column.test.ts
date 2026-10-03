import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { BOARD_COLUMNS, type BoardColumnId, boardColumn, columnTarget } from "./board-column";
import { MOVE_REFUSAL } from "./move-refusal";
import { type MoveRequest, moveToColumn } from "./move-to-column";
import { actionEventsFor, insertAction } from "./store";
import type { NewAction } from "./types";

const t0 = new Date("2026-10-02T09:00:00Z");
const t1 = new Date("2026-10-03T09:00:00Z");
const PR = "https://github.com/acme/widget/pull/42";

function setup() {
  const db = openTestDb();
  let n = 0;
  /** An action already sitting in `column`, created straight into it. */
  const seed = (column: BoardColumnId, over: Partial<NewAction> = {}) =>
    insertAction(
      db,
      ruleAction({ ruleKey: `rule-${++n}`, ...columnTarget(column), ...over }),
      "scan",
      null,
      t0,
    );
  const move = (over: Partial<MoveRequest> & Pick<MoveRequest, "id" | "from" | "to">) =>
    moveToColumn(db, {
      actor: "owner",
      login: "owner@example.com",
      productIds: ["acme-docs"],
      now: t1,
      ...over,
    } as MoveRequest);
  const row = (id: number) => db.select().from(actions).where(eq(actions.id, id)).get();
  const lastEvent = (id: number) => actionEventsFor(db, id).at(-1);
  const audits = () =>
    db
      .select()
      .from(auditLog)
      .all()
      .map((e) => [e.login, e.event, e.detail]);
  return { db, seed, move, row, lastEvent, audits };
}

const PAIRS = BOARD_COLUMNS.flatMap((from) =>
  BOARD_COLUMNS.filter((to) => to !== from).map((to) => [from, to] as const),
);

describe("moveToColumn", () => {
  it.each(PAIRS)("moves a card from %s to %s with one event", (from, to) => {
    const { seed, move, row, lastEvent, db } = setup();
    const id = seed(from);
    const before = row(id);
    expect(move({ id, from, to })).toEqual({ ok: true });
    const after = row(id);
    expect(after && boardColumn(after)).toBe(to);
    expect(after?.statusChangedAt).toEqual(t1);
    expect(actionEventsFor(db, id)).toHaveLength(2);
    expect(lastEvent(id)).toMatchObject({
      actor: "owner",
      at: t1,
      from: before?.status,
      to: columnTarget(to).status,
      fromStage: before?.stage,
      toStage: columnTarget(to).stage,
      note: null,
    });
  });

  it.each(BOARD_COLUMNS.filter((c) => c !== "done"))(
    "accepts a new idea moved to %s, in one event from suggested",
    (to) => {
      const { db, move, row, lastEvent } = setup();
      const id = insertAction(db, agentAction(analystJob(db), "Add an FAQ"), "agent", null, t0);
      // Backlog included: dropping a new idea where it already sits accepts it as open.
      expect(move({ id, from: "backlog", to })).toEqual({ ok: true });
      expect(row(id)).toMatchObject(columnTarget(to));
      expect(actionEventsFor(db, id)).toHaveLength(2);
      expect(lastEvent(id)).toMatchObject({ from: "suggested", to: columnTarget(to).status });
    },
  );

  it("refuses to finish a new idea nobody accepted", () => {
    const { db, move, row } = setup();
    const id = insertAction(db, agentAction(analystJob(db), "Add an FAQ"), "agent", null, t0);
    expect(move({ id, from: "backlog", to: "done" })).toEqual({
      ok: false,
      reason: "not_allowed",
    });
    expect(row(id)?.status).toBe("suggested");
  });

  it("is stale when the card is not in the column the mover saw, and writes nothing", () => {
    const { db, seed, move, row, audits } = setup();
    const id = seed("queue");
    // The first mover takes it to Started; the second still sees it in Queue.
    expect(move({ id, from: "queue", to: "started" })).toEqual({ ok: true });
    expect(move({ id, from: "queue", to: "done" })).toEqual({ ok: false, reason: "stale" });
    expect(row(id)?.stage).toBe("started");
    expect(actionEventsFor(db, id)).toHaveLength(2);
    expect(audits()).toHaveLength(1);
  });

  it.each(["snoozed", "dismissed"] as const)("treats a %s card as moved already", (status) => {
    const { seed, move } = setup();
    const id = seed("backlog", {
      status,
      snoozedUntil: status === "snoozed" ? "2026-10-09" : null,
    });
    expect(move({ id, from: "backlog", to: "queue" })).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses a move to the column the card is in", () => {
    const { seed, move, db } = setup();
    const id = seed("started");
    expect(move({ id, from: "started", to: "started" })).toEqual({
      ok: false,
      reason: "same_column",
    });
    expect(actionEventsFor(db, id)).toHaveLength(1);
  });

  it("refuses In progress for a card with a pull request: it counts as In review", () => {
    const { db, seed, move, row } = setup();
    const linked = seed("in_progress", { stage: null });
    db.update(actions).set({ prUrl: PR }).where(eq(actions.id, linked)).run();
    const linkedRow = row(linked);
    expect(linkedRow && boardColumn(linkedRow)).toBe("in_review");
    expect(move({ id: linked, from: "in_review", to: "in_progress" })).toEqual({
      ok: false,
      reason: "has_pull_request",
    });
    const started = seed("started");
    db.update(actions).set({ prUrl: PR }).where(eq(actions.id, started)).run();
    expect(move({ id: started, from: "started", to: "in_progress" })).toEqual({
      ok: false,
      reason: "has_pull_request",
    });
    // Any other column is fine.
    expect(move({ id: started, from: "started", to: "in_review" })).toEqual({ ok: true });
    expect(MOVE_REFUSAL.has_pull_request).toBe(
      "This card has a pull request, so it counts as In review.",
    );
  });

  it("needs a note from Claude, and records it", () => {
    const { seed, move, lastEvent, audits } = setup();
    const id = seed("queue");
    for (const note of [undefined, "   "]) {
      expect(move({ id, from: "queue", to: "started", actor: "claude", note })).toEqual({
        ok: false,
        reason: "note_required",
      });
    }
    expect(audits()).toEqual([]);
    const ok = move({
      id,
      from: "queue",
      to: "started",
      actor: "claude",
      login: "claude",
      note: "  Picked up  ",
    });
    expect(ok).toEqual({ ok: true });
    expect(lastEvent(id)).toMatchObject({ actor: "claude", note: "Picked up" });
  });

  it("audits the move without the note", () => {
    const { seed, move, audits } = setup();
    const id = seed("queue");
    move({ id, from: "queue", to: "in_review", note: "secret words" });
    expect(audits()).toEqual([
      [
        "owner@example.com",
        "action_status_changed",
        {
          id,
          actor: "owner",
          from: "open",
          to: "in_progress",
          fromColumn: "queue",
          toColumn: "in_review",
        },
      ],
    ]);
    expect(JSON.stringify(audits())).not.toContain("secret");
  });

  it("is not found for a missing card or one of an unconfigured product", () => {
    const { seed, move, row } = setup();
    const other = seed("queue", { productId: "retired-product" });
    expect(move({ id: 999, from: "queue", to: "started" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(move({ id: other, from: "queue", to: "started" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(row(other)?.stage).toBe("queue");
  });

  it("has a plain sentence for every refusal", () => {
    for (const sentence of Object.values(MOVE_REFUSAL)) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
      expect(sentence).not.toMatch(/_|\bstale\b|\bstage\b/);
    }
    expect(Object.keys(MOVE_REFUSAL).sort()).toEqual([
      "has_pull_request",
      "not_allowed",
      "not_found",
      "note_required",
      "same_column",
      "stale",
    ]);
  });
});
