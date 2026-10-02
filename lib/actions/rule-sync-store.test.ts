import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions } from "@/lib/db/schema";
import type { Issue, RuleOutcome } from "@/lib/scan/issues";
import { openTestDb } from "@/tests/helpers/db";
import { syncRuleActions } from "./rule-sync-store";
import { actionEventsFor, setStatus } from "./store";

const t1 = new Date("2026-10-02T06:30:00Z");
const t2 = new Date("2026-10-03T06:30:00Z");

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  area: "SEO",
  impact: "high",
  title: "2 pages have no title",
  problem: "These pages have no <title>.",
  fix: "Give each page a title.",
  check: "Each listed URL serves a <title>.",
  locations: ["https://docs.example.com/a", "https://docs.example.com/b"],
  total: 2,
  effort: "small",
  docs: ["research/seo/technical-seo-checklist.md"],
  ...over,
});
const present = (id: string, over: Partial<Issue> = {}): RuleOutcome => ({
  ruleId: id,
  state: "present",
  issue: issue(id, over),
});
const clear = (id: string): RuleOutcome => ({ ruleId: id, state: "clear" });

function sync(db: Db, outcomes: RuleOutcome[], scanDate: string, now: Date) {
  return syncRuleActions(db, { productId: "acme-docs", outcomes, scanDate, now });
}

function only(db: Db) {
  const rows = db.select().from(actions).all();
  const [row] = rows;
  if (rows.length !== 1 || !row) throw new Error(`expected one action, got ${rows.length}`);
  return row;
}

const history = (db: Db, id: number) =>
  actionEventsFor(db, id).map(({ actor, from, to, note }) => ({ actor, from, to, note }));

describe("syncRuleActions", () => {
  it("creates an open rule action from a present issue", () => {
    const db = openTestDb();
    expect(sync(db, [present("missing-title")], "2026-10-02", t1)).toEqual({
      created: 1,
      resolved: 0,
      reopened: 0,
    });
    const row = only(db);
    expect(row).toMatchObject({
      productId: "acme-docs",
      source: "rule",
      ruleKey: "missing-title",
      status: "open",
      issuePresent: true,
      title: "2 pages have no title",
      why: "These pages have no <title>.",
      evidence: {
        items: [
          { text: "https://docs.example.com/a", url: "https://docs.example.com/a" },
          { text: "https://docs.example.com/b", url: "https://docs.example.com/b" },
        ],
        total: 2,
      },
    });
    expect(history(db, row.id)).toEqual([
      { actor: "scan", from: null, to: "open", note: "Found in the check of 2026-10-02" },
    ]);
  });

  it("resolves the action when the next scan no longer finds the issue", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    expect(sync(db, [clear("missing-title")], "2026-10-03", t2)).toEqual({
      created: 0,
      resolved: 1,
      reopened: 0,
    });
    const row = only(db);
    expect(row).toMatchObject({ status: "done", issuePresent: false, statusChangedAt: t2 });
    expect(history(db, row.id)).toEqual([
      { actor: "scan", from: null, to: "open", note: "Found in the check of 2026-10-02" },
      {
        actor: "scan",
        from: "open",
        to: "done",
        note: "Resolved — not found in the check of 2026-10-03",
      },
    ]);
  });

  it("refreshes the content of an open action while the issue persists", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    sync(
      db,
      [present("missing-title", { title: "3 pages have no title", total: 3 })],
      "2026-10-03",
      t2,
    );
    expect(only(db)).toMatchObject({
      status: "open",
      title: "3 pages have no title",
      titleKey: "3 pages have no title",
      updatedAt: t2,
      statusChangedAt: t1,
    });
    expect(only(db).evidence.total).toBe(3);
  });

  it("gives a stored action its new title on the next scan, even when it is dismissed", () => {
    const db = openTestDb();
    sync(db, [present("no-llms-txt", { title: "No llms.txt" })], "2026-10-02", t1);
    const created = only(db);
    setStatus(db, created.id, "open", "dismissed", { actor: "owner", now: t1 });
    const plain = "No guide to your site for AI assistants";
    sync(db, [present("no-llms-txt", { title: plain })], "2026-10-03", t2);
    expect(only(db)).toMatchObject({
      status: "dismissed",
      title: plain,
      titleKey: "no guide to your site for ai assistants",
    });
  });

  it("keeps a dismissed action dismissed while the issue persists", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    const { id } = only(db);
    setStatus(db, id, "open", "dismissed", { actor: "owner", now: t1 });
    expect(sync(db, [present("missing-title")], "2026-10-03", t2).reopened).toBe(0);
    expect(only(db)).toMatchObject({ status: "dismissed", issuePresent: true });
  });

  it("reopens an action marked done while the issue is still present", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    const { id } = only(db);
    setStatus(db, id, "open", "done", { actor: "owner", now: t1 });
    expect(sync(db, [present("missing-title")], "2026-10-03", t2)).toEqual({
      created: 0,
      resolved: 0,
      reopened: 1,
    });
    expect(only(db)).toMatchObject({ status: "open", issuePresent: true });
    expect(history(db, id).at(-1)).toEqual({
      actor: "scan",
      from: "done",
      to: "open",
      note: "Still present in the check of 2026-10-03",
    });
  });

  it("does not wake a snooze when the issue is still present", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    const { id } = only(db);
    setStatus(db, id, "open", "snoozed", { actor: "owner", snoozedUntil: "2026-10-20", now: t1 });
    expect(sync(db, [present("missing-title")], "2026-10-03", t2).reopened).toBe(0);
    expect(only(db)).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-20" });
  });

  it("writes nothing when a later scan has the same outcomes", () => {
    const db = openTestDb();
    const outcomes = [present("missing-title"), present("no-llms-txt"), clear("noindex")];
    sync(db, outcomes, "2026-10-02", t1);
    const rows = db.select().from(actions).all();
    const events = db.select().from(actionEvents).all();
    expect(sync(db, outcomes, "2026-10-03", t2)).toEqual({ created: 0, resolved: 0, reopened: 0 });
    expect(db.select().from(actions).all()).toEqual(rows);
    expect(db.select().from(actionEvents).all()).toEqual(events);
  });

  it("reopens a resolved action when the issue comes back", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    sync(db, [clear("missing-title")], "2026-10-03", t2);
    const t3 = new Date("2026-10-04T06:30:00Z");
    expect(sync(db, [present("missing-title")], "2026-10-04", t3).reopened).toBe(1);
    const row = only(db);
    expect(row).toMatchObject({ status: "open", issuePresent: true });
    expect(history(db, row.id).at(-1)).toEqual({
      actor: "scan",
      from: "done",
      to: "open",
      note: "Back in the check of 2026-10-04",
    });
  });

  it.each(["done", "dismissed"] as const)(
    "only records that the issue cleared on a %s action",
    (status) => {
      const db = openTestDb();
      sync(db, [present("missing-title")], "2026-10-02", t1);
      const { id } = only(db);
      setStatus(db, id, "open", status, { actor: "owner", now: t1 });
      const before = history(db, id);
      expect(sync(db, [clear("missing-title")], "2026-10-03", t2)).toEqual({
        created: 0,
        resolved: 0,
        reopened: 0,
      });
      expect(only(db)).toMatchObject({ status, issuePresent: false, updatedAt: t2 });
      expect(history(db, id)).toEqual(before);
    },
  );

  it("leaves other products' actions alone", () => {
    const db = openTestDb();
    syncRuleActions(db, {
      productId: "other-docs",
      outcomes: [present("missing-title")],
      scanDate: "2026-10-02",
      now: t1,
    });
    expect(sync(db, [clear("missing-title")], "2026-10-03", t2).resolved).toBe(0);
    expect(sync(db, [present("missing-title")], "2026-10-03", t2).created).toBe(1);
  });

  it("writes nothing when any part of the sync fails", () => {
    const db = openTestDb();
    sync(db, [present("missing-title")], "2026-10-02", t1);
    db.run(
      sql.raw(
        "CREATE TRIGGER fail_llms BEFORE INSERT ON actions WHEN NEW.rule_key = 'no-llms-txt' BEGIN SELECT RAISE(ABORT, 'insert failed'); END;",
      ),
    );
    const outcomes = [clear("missing-title"), present("broken-links"), present("no-llms-txt")];
    expect(() => sync(db, outcomes, "2026-10-03", t2)).toThrow("insert failed");
    expect(db.select().from(actions).all()).toEqual([
      expect.objectContaining({ ruleKey: "missing-title", status: "open", issuePresent: true }),
    ]);
    expect(db.select().from(actionEvents).where(eq(actionEvents.to, "done")).all()).toEqual([]);
  });
});
