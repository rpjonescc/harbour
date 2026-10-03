import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertAction } from "@/lib/actions/store";
import type { Db } from "@/lib/db/client";
import { actionEvents } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, finishJob, type JobKind } from "@/lib/jobs/queue";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { ago, DAY, HOUR, MIN, PRODUCT_ROWS, t0, towerConfig } from "@/tests/helpers/tower";
import { activityFacts } from "./activity-data";

let db: Db;
let dir: string;

beforeEach(() => {
  db = openTestDb();
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-activity-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ALL_OFF = Object.fromEntries(
  ["SCANS", "ANALYST", "RESEARCH", "NOTE", "DIGEST", "IDEAS", "BACKUP"].map((name) => [
    `HARBOUR_SCHEDULED_${name}`,
    "off",
  ]),
);
/** Every schedule off unless `env` turns one on. */
const read = (env: Record<string, string> = {}) =>
  activityFacts(db, PRODUCT_ROWS, towerConfig(dir, { ...ALL_OFF, ...env }), t0);

function ran(kind: JobKind, params: Record<string, string>, status: "ok" | "failed", at: Date) {
  const { id } = enqueueJob(db, kind, params, null, new Date(at.getTime() - MIN));
  claimNextJob(db, new Date(at.getTime() - MIN));
  finishJob(db, id, status, status === "failed" ? "boom" : null, at);
  return id;
}

describe("activityFacts", () => {
  it("is empty on a fresh install, with no next run when every schedule is off", () => {
    expect(read()).toEqual({
      running: [],
      queued: [],
      finished: [],
      moves: [],
      scoreRises: [],
      nextRun: null,
    });
  });

  it("keeps jobs finished exactly 24 h ago and drops older ones, newest first", () => {
    const edge = ran("backup", { day: "2026-10-01" }, "ok", ago(DAY));
    ran("backup", { day: "2026-09-30" }, "ok", ago(DAY + 1));
    const recent = ran("discovery", { productId: "acme-docs" }, "failed", ago(HOUR));
    expect(read().finished.map((j) => j.id)).toEqual([recent, edge]);
  });

  it("leaves out routine note saves that worked, but keeps one that failed", () => {
    ran("notes-sync", {}, "ok", ago(HOUR));
    ran("brain-push", {}, "ok", ago(HOUR));
    const failed = ran("notes-sync", {}, "failed", ago(2 * HOUR));
    expect(read().finished.map((j) => j.id)).toEqual([failed]);
  });

  it("reads running and waiting jobs of every kind", () => {
    const { id: running } = enqueueJob(db, "scan", { productId: "acme-docs" }, null, ago(MIN));
    claimNextJob(db, ago(MIN));
    const { id: queued } = enqueueJob(db, "daily-note", { stamp: "2026-10-02" }, null, t0);
    const facts = read();
    expect(facts.running.map((j) => j.id)).toEqual([running]);
    expect(facts.queued.map((j) => j.id)).toEqual([queued]);
  });

  it("reads card moves in the window for configured products, not their creation", () => {
    const id = insertAction(db, ruleAction({ title: "Add a sitemap" }), "scan", null, ago(HOUR));
    const elsewhere = insertAction(db, ruleAction({ productId: "other" }), "scan", null, ago(HOUR));
    const moved = (actionId: number, at: Date) =>
      db
        .insert(actionEvents)
        .values({ actionId, at, actor: "claude", from: "open", to: "done" })
        .run();
    moved(id, ago(30 * MIN));
    moved(id, ago(2 * DAY));
    moved(elsewhere, ago(MIN));
    expect(read().moves).toEqual([
      {
        actionId: id,
        title: "Add a sitemap",
        productId: "acme-docs",
        actor: "claude",
        toStatus: "done",
        toStage: null,
        at: ago(30 * MIN),
      },
    ]);
  });

  it("reads score rises from checks in the window only", () => {
    const totals = (seo: number) => ({ seo, geo: 40, aeo: 30 });
    seedScan(db, { productId: "acme-docs", at: ago(3 * DAY), totals: totals(50) });
    seedScan(db, { productId: "acme-docs", at: ago(2 * HOUR), totals: totals(56) });
    seedScan(db, { productId: "acme-blog", at: ago(3 * DAY), totals: totals(50) });
    seedScan(db, { productId: "acme-blog", at: ago(2 * DAY), totals: totals(70) }); // too old
    expect(read().scoreRises).toEqual([
      { productId: "acme-docs", area: "seo", from: 50, to: 56, at: ago(2 * HOUR) },
    ]);
  });

  it("finds the next scheduled run of any kind that is on", () => {
    // Daily checks at 06:00 London (05:00 UTC); backups at 03:15 (02:15 UTC).
    expect(read({ HARBOUR_SCHEDULED_SCANS: "on" }).nextRun).toEqual(
      new Date("2026-10-03T05:00:00Z"),
    );
    expect(read({ HARBOUR_SCHEDULED_SCANS: "on", HARBOUR_SCHEDULED_BACKUP: "on" }).nextRun).toEqual(
      new Date("2026-10-03T02:15:00Z"),
    );
  });
});
