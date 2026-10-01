import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions, jobs } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import {
  actionEventsFor,
  addActionEvent,
  insertAction,
  MAX_ACTION_EVENTS,
  normaliseTitle,
  setStatus,
  wakeDueSnoozes,
} from "./store";
import type { NewAction } from "./types";

const t0 = new Date("2026-10-02T09:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

function ruleAction(over: Partial<NewAction> = {}): NewAction {
  return {
    productId: "acme-docs",
    area: "SEO",
    title: "Add meta descriptions",
    why: "Pages without a description get a generated snippet.",
    fix: "Write a one-sentence description for each page.",
    check: "Every page has a meta description.",
    impact: "medium",
    effort: "small",
    evidence: {
      items: [{ text: "https://example.com/a", url: "https://example.com/a" }],
      total: 1,
    },
    docs: [],
    source: "rule",
    ruleKey: "missing-meta-description",
    sourceJobId: null,
    status: "open",
    snoozedUntil: null,
    issuePresent: true,
    ...over,
  };
}

function agentAction(title: string, over: Partial<NewAction> = {}): NewAction {
  return ruleAction({ source: "agent", ruleKey: null, status: "suggested", title, ...over });
}

function rowOf(db: Db, id: number) {
  const row = db.select().from(actions).where(eq(actions.id, id)).get();
  if (!row) throw new Error(`action ${id} missing`);
  return row;
}

describe("normaliseTitle", () => {
  it.each([
    ["Add  meta\tdescriptions", "add meta descriptions"],
    ["  Add FAQ schema.  ", "add faq schema"],
    ["Fix titles!?…", "fix titles"],
    ["Ｆｕｌｌwidth ｔｉｔｌｅ", "fullwidth title"],
    ["Keep v2.0 inside", "keep v2.0 inside"],
  ])("%j → %j", (input, expected) => {
    expect(normaliseTitle(input)).toBe(expected);
  });
});

describe("insertAction", () => {
  it("stores the action with timestamps, a title key and a creation event", () => {
    const db = openTestDb();
    const id = insertAction(
      db,
      ruleAction({ title: "Add Meta Descriptions." }),
      "scan",
      "Found by scan",
      t0,
    );
    expect(rowOf(db, id)).toMatchObject({
      titleKey: "add meta descriptions",
      status: "open",
      createdAt: t0,
      updatedAt: t0,
      statusChangedAt: t0,
    });
    expect(actionEventsFor(db, id)).toEqual([
      expect.objectContaining({
        actor: "scan",
        from: null,
        to: "open",
        note: "Found by scan",
        at: t0,
      }),
    ]);
  });

  it("rejects a rule action without a rule key and an agent action with one", () => {
    const db = openTestDb();
    expect(() => insertAction(db, ruleAction({ ruleKey: null }), "scan", null, t0)).toThrow(
      /CHECK constraint/,
    );
    expect(() =>
      insertAction(
        db,
        agentAction("x", { ruleKey: "missing-meta-description" }),
        "agent",
        null,
        t0,
      ),
    ).toThrow(/CHECK constraint/);
  });

  it("rejects a snoozed action without a date and a date on an open one", () => {
    const db = openTestDb();
    expect(() => insertAction(db, ruleAction({ status: "snoozed" }), "scan", null, t0)).toThrow(
      /CHECK constraint/,
    );
    expect(() =>
      insertAction(db, ruleAction({ snoozedUntil: "2026-10-09" }), "scan", null, t0),
    ).toThrow(/CHECK constraint/);
  });

  it("allows one rule action per product and rule, but many agent actions", () => {
    const db = openTestDb();
    insertAction(db, ruleAction(), "scan", null, t0);
    expect(() => insertAction(db, ruleAction(), "scan", null, t0)).toThrow(/UNIQUE constraint/);
    insertAction(db, ruleAction({ productId: "acme-blog" }), "scan", null, t0);
    insertAction(db, agentAction("Write a glossary"), "agent", null, t0);
    insertAction(db, agentAction("Write a glossary"), "agent", null, t0);
    expect(db.select().from(actions).all()).toHaveLength(4);
  });

  it("links an agent action to its job", () => {
    const db = openTestDb();
    const job = db
      .insert(jobs)
      .values({
        kind: "weekly-analyst",
        params: {},
        dedupeKey: "weekly-analyst:[]",
        status: "ok",
        requestedBy: null,
        createdAt: t0,
      })
      .returning({ id: jobs.id })
      .get();
    const id = insertAction(
      db,
      agentAction("Write a glossary", { sourceJobId: job.id }),
      "agent",
      null,
      t0,
    );
    expect(rowOf(db, id).sourceJobId).toBe(job.id);
  });
});

describe("setStatus", () => {
  it("changes status with an event, refusing a stale from", () => {
    const db = openTestDb();
    const id = insertAction(db, ruleAction(), "scan", null, t0);
    expect(
      setStatus(db, id, "open", "in_progress", { actor: "owner", note: "Starting", now: at(1) }),
    ).toBe(true);
    expect(setStatus(db, id, "open", "done", { actor: "owner", now: at(2) })).toBe(false);
    expect(rowOf(db, id)).toMatchObject({
      status: "in_progress",
      updatedAt: at(1),
      statusChangedAt: at(1),
    });
    expect(actionEventsFor(db, id).map((e) => [e.actor, e.from, e.to, e.note])).toEqual([
      ["scan", null, "open", null],
      ["owner", "open", "in_progress", "Starting"],
    ]);
  });

  it("sets the snooze date and clears it when leaving snoozed", () => {
    const db = openTestDb();
    const id = insertAction(db, ruleAction(), "scan", null, t0);
    setStatus(db, id, "open", "snoozed", {
      actor: "owner",
      snoozedUntil: "2026-10-09",
      now: at(1),
    });
    expect(rowOf(db, id)).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-09" });
    setStatus(db, id, "snoozed", "open", { actor: "owner", now: at(2) });
    expect(rowOf(db, id)).toMatchObject({ status: "open", snoozedUntil: null });
  });

  it("refuses to snooze without a date (check constraint)", () => {
    const db = openTestDb();
    const id = insertAction(db, ruleAction(), "scan", null, t0);
    expect(() => setStatus(db, id, "open", "snoozed", { actor: "owner", now: at(1) })).toThrow(
      /CHECK constraint/,
    );
    expect(rowOf(db, id).status).toBe("open");
  });
});

describe("addActionEvent", () => {
  it(`keeps only the newest ${MAX_ACTION_EVENTS} events per action`, () => {
    const db = openTestDb();
    const id = insertAction(db, ruleAction(), "scan", null, t0);
    const other = insertAction(db, ruleAction({ productId: "acme-blog" }), "scan", null, t0);
    for (let i = 0; i < 60; i++) {
      addActionEvent(db, {
        actionId: id,
        at: at(i),
        actor: "system",
        from: "open",
        to: "open",
        note: `n${i}`,
      });
    }
    const events = actionEventsFor(db, id);
    expect(events).toHaveLength(MAX_ACTION_EVENTS);
    expect(events[0]?.note).toBe("n10");
    expect(events.at(-1)?.note).toBe("n59");
    expect(actionEventsFor(db, other)).toHaveLength(1);
    expect(db.select().from(actionEvents).all()).toHaveLength(MAX_ACTION_EVENTS + 1);
  });
});

describe("wakeDueSnoozes", () => {
  it("opens snoozes whose date has come, with a note", () => {
    const db = openTestDb();
    const ids = ["2026-10-01", "2026-10-02", "2026-10-03"].map((until, i) => {
      const id = insertAction(db, ruleAction({ ruleKey: `rule-${i}` }), "scan", null, t0);
      setStatus(db, id, "open", "snoozed", { actor: "owner", snoozedUntil: until, now: t0 });
      return id;
    });
    const [past, today, future] = ids;
    if (past === undefined || today === undefined || future === undefined) throw new Error("ids");
    expect(wakeDueSnoozes(db, "2026-10-02", at(5))).toBe(2);
    expect(rowOf(db, past)).toMatchObject({
      status: "open",
      snoozedUntil: null,
      statusChangedAt: at(5),
    });
    expect(rowOf(db, today).status).toBe("open");
    expect(rowOf(db, future)).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-03" });
    expect(actionEventsFor(db, past).at(-1)).toMatchObject({
      actor: "system",
      from: "snoozed",
      to: "open",
      note: "Snooze ended",
    });
    expect(wakeDueSnoozes(db, "2026-10-02", at(6))).toBe(0);
  });
});
