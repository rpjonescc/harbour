import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, finishJob, type JobKind } from "@/lib/jobs/queue";
import { recordWorkerBeat } from "@/lib/ops/worker-beat";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { ago, DAY, HOUR, MIN, PRODUCT_ROWS, t0, towerConfig } from "@/tests/helpers/tower";
import { systemLights } from "./system";
import { systemFacts } from "./system-data";

const brainGit = vi.hoisted(() => ({ reads: 0 }));
vi.mock("@/lib/agents/brain-status", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agents/brain-status")>();
  return {
    ...real,
    readSyncCounts: () => {
      brainGit.reads += 1;
      return { unsaved: 1, unpushed: 0 };
    },
  };
});

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-system-"));
  db = openTestDb();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A job that ran and ended `status` at `at`; returns its id. */
function ran(
  kind: JobKind,
  params: Record<string, string>,
  status: "ok" | "failed",
  at: Date,
): number {
  const { id } = enqueueJob(db, kind, params, null, new Date(at.getTime() - MIN));
  claimNextJob(db, new Date(at.getTime() - MIN));
  finishJob(db, id, status, status === "failed" ? "boom" : null, at);
  return id;
}

describe("systemFacts", () => {
  it("reads a fresh install honestly: no beat, nothing checked, schedules never run", () => {
    const facts = systemFacts(db, towerConfig(dir), PRODUCT_ROWS, t0);
    expect(facts.worker).toEqual({ lastSeen: null, startedAt: null, runningJob: false });
    expect(facts.checks.map((c) => c.scannedAt)).toEqual([null, null]);
    expect(facts.schedules.find((s) => s.row.id === "scan")?.lastRun).toBeNull();
    expect(facts.agents).toEqual({
      running: [],
      queued: [],
      failedUnretried: [],
      finishedToday: 0,
    });
    expect(facts.notesSavedAt).toBeNull();
    expect(facts.products).toEqual([
      { id: "acme-docs", name: "Acme Docs" },
      { id: "acme-blog", name: "Acme Blog" },
    ]);
    const { lights, worst } = systemLights(facts, t0, "Europe/London", "en-GB");
    expect(lights.find((l) => l.id === "worker")?.tone).toBe("unknown");
    expect(lights.find((l) => l.id === "checks")?.tone).toBe("unknown");
    expect(lights.some((l) => l.tone === "ok" && l.id === "sources")).toBe(false);
    expect(worst).not.toBeNull();
  });

  it("reads the beat, each product's check and its failing sources", () => {
    recordWorkerBeat(db, ago(MIN));
    seedScan(db, {
      productId: "acme-docs",
      at: ago(3 * HOUR),
      status: "partial",
      runs: [{ collector: "pagespeed", status: "failed", error: "quota" }],
    });
    seedScan(db, { productId: "acme-blog", at: ago(2 * HOUR), status: "failed", scored: false });
    const facts = systemFacts(db, towerConfig(dir), PRODUCT_ROWS, t0);
    expect(facts.worker.lastSeen).toEqual(ago(MIN));
    expect(facts.checks).toEqual([
      expect.objectContaining({ productId: "acme-docs", scannedAt: ago(3 * HOUR), failedAt: null }),
      expect.objectContaining({ productId: "acme-blog", scannedAt: null, failedAt: ago(2 * HOUR) }),
    ]);
    expect(facts.failures).toEqual([
      { productId: "acme-docs", collector: "pagespeed", error: "quota" },
    ]);
  });

  it("reads each schedule's latest finished run, a refresh only from research refreshes", () => {
    ran("weekly-analyst", { week: "2026-W39" }, "ok", ago(5 * DAY));
    ran("weekly-analyst", { week: "2026-W40" }, "failed", ago(HOUR));
    ran("research", { topic: "glossary", mode: "refresh" }, "ok", ago(9 * DAY));
    ran("research", { topic: "glossary" }, "ok", ago(DAY));
    const config = towerConfig(dir, {
      HARBOUR_SCHEDULED_ANALYST: "on",
      HARBOUR_SCHEDULED_RESEARCH: "on",
    });
    const facts = systemFacts(db, config, PRODUCT_ROWS, t0);
    const last = (id: string) => facts.schedules.find((s) => s.row.id === id)?.lastRun;
    expect(last("analyst")).toEqual({ status: "failed", at: ago(HOUR) });
    expect(last("refresh")).toEqual({ status: "ok", at: ago(9 * DAY) });
  });

  it("reads agent runs: running, waiting, failed and not retried, finished today", () => {
    ran("daily-note", { stamp: "2026-10-02" }, "ok", ago(2 * HOUR)); // 08:00 local: today
    ran("daily-note", { stamp: "2026-10-01" }, "ok", ago(10 * HOUR + MIN)); // 23:59 yesterday
    const failed = ran("content-ideas", { productId: "acme-docs" }, "failed", ago(5 * HOUR));
    ran("discovery", { productId: "acme-docs" }, "failed", ago(4 * HOUR));
    ran("discovery", { productId: "acme-blog" }, "ok", ago(3 * HOUR)); // a later success
    ran("weekly-analyst", { week: "2026-W39" }, "failed", ago(2 * DAY)); // outside 24 h
    const { id: running } = enqueueJob(db, "research", { topic: "glossary" }, null, ago(MIN));
    claimNextJob(db, ago(MIN));
    const { id: queued } = enqueueJob(db, "discovery", { productId: "acme-blog" }, null, t0);
    enqueueJob(db, "scan", { productId: "acme-docs" }, null, t0); // not an agent run
    const { agents } = systemFacts(db, towerConfig(dir), PRODUCT_ROWS, t0);
    expect(agents.running.map((j) => j.id)).toEqual([running]);
    expect(agents.queued.map((j) => j.id)).toEqual([queued]);
    expect(agents.failedUnretried.map((j) => j.id)).toEqual([failed]);
    expect(agents.finishedToday).toBe(2); // the note at 08:00 and the discovery at 07:00
  });

  it("reads when notes were last saved", () => {
    const id = ran("notes-sync", {}, "ok", ago(3 * HOUR));
    ran("notes-sync", {}, "failed", ago(HOUR));
    expect(systemFacts(db, towerConfig(dir), PRODUCT_ROWS, t0).notesSavedAt).toEqual(ago(3 * HOUR));
    expect(db.select().from(jobs).where(eq(jobs.id, id)).get()?.status).toBe("ok");
  });

  it("runs git in the brain once for every Today render within 30 seconds", () => {
    const config = towerConfig(dir);
    const before = brainGit.reads;
    expect(systemFacts(db, config, PRODUCT_ROWS, t0).brain.sync).toEqual({
      unsaved: 1,
      unpushed: 0,
    });
    systemFacts(db, config, PRODUCT_ROWS, new Date(t0.getTime() + 15_000));
    expect(brainGit.reads - before).toBe(1);
    systemFacts(db, config, PRODUCT_ROWS, new Date(t0.getTime() + 30_000));
    expect(brainGit.reads - before).toBe(2);
  });
});
