import { eq } from "drizzle-orm";
import { actions, auditLog } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { applyStatusChange, type StatusChangeRequest } from "./status-change";
import { actionEventsFor, insertAction, setStatus } from "./store";

const t0 = new Date("2026-10-02T09:00:00Z");
const today = "2026-10-02";

function setup() {
  const db = openTestDb();
  const id = insertAction(db, ruleAction(), "scan", null, t0);
  const change = (over: Partial<StatusChangeRequest> = {}) =>
    applyStatusChange(db, {
      id,
      from: "open",
      change: { to: "in_progress", note: "Starting with the docs" },
      actor: "claude",
      login: "claude",
      productIds: ["acme-docs"],
      today,
      now: t0,
      ...over,
    });
  const audits = () =>
    db
      .select()
      .from(auditLog)
      .all()
      .map((e) => [e.login, e.event, e.detail]);
  const statusOf = () => db.select().from(actions).where(eq(actions.id, id)).get()?.status;
  return { db, id, change, audits, statusOf };
}

describe("applyStatusChange", () => {
  it("records Claude as the actor with the note, and audits without the note", () => {
    const { db, id, change, audits, statusOf } = setup();
    expect(change()).toEqual({ ok: true, id, status: "in_progress", snoozedUntil: null });
    expect(statusOf()).toBe("in_progress");
    expect(actionEventsFor(db, id).at(-1)).toMatchObject({
      actor: "claude",
      from: "open",
      to: "in_progress",
      note: "Starting with the docs",
    });
    expect(audits()).toEqual([
      [
        "claude",
        "action_status_changed",
        { id, actor: "claude", from: "open", to: "in_progress", until: null },
      ],
    ]);
    expect(JSON.stringify(audits())).not.toContain("Starting");
  });

  it("refuses a stale change without writing anything", () => {
    const { db, id, change, audits, statusOf } = setup();
    setStatus(db, id, "open", "done", { actor: "scan", now: t0 });
    expect(change()).toEqual({ ok: false, error: "stale", conflict: true });
    expect(statusOf()).toBe("done");
    expect(audits()).toEqual([]);
  });

  it("refuses a move the status does not allow and a snooze without a valid date", () => {
    const { change, audits } = setup();
    expect(change({ change: { to: "open" } })).toMatchObject({ error: "not_allowed" });
    expect(change({ change: { to: "snoozed" } })).toMatchObject({ error: "until_required" });
    expect(change({ change: { to: "snoozed", until: today } })).toMatchObject({
      error: "until_invalid",
    });
    expect(audits()).toEqual([]);
  });

  it("stores the snooze date", () => {
    const { id, change } = setup();
    const result = change({ change: { to: "snoozed", until: "2026-10-09", note: "After launch" } });
    expect(result).toEqual({ ok: true, id, status: "snoozed", snoozedUntil: "2026-10-09" });
  });

  it("treats an action of an unconfigured product as missing", () => {
    const { change, statusOf } = setup();
    expect(change({ productIds: ["acme-blog"] })).toEqual({ ok: false, error: "not_found" });
    expect(change({ id: 999 })).toEqual({ ok: false, error: "not_found" });
    expect(statusOf()).toBe("open");
  });
});
