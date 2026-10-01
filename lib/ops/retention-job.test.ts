import { parseConfig } from "@/lib/config";
import { connectionOf, type Db } from "@/lib/db/client";
import { claimNextJob, enqueueJob, eventsSince, getJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { addScans, scansWithObservations } from "@/tests/helpers/retention";
import { type OpsJobDeps, runRetentionJob } from "./backup-job";

const state = vi.hoisted(() => ({ countFails: false }));
vi.mock("./retention", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./retention")>();
  return {
    ...actual,
    // Stands in for a failed observation count, which planRetention reports as null.
    planRetention: (...args: Parameters<typeof actual.planRetention>) => {
      const plan = actual.planRetention(...args);
      if (!state.countFails) return plan;
      return { ...plan, products: plan.products.map((p) => ({ ...p, observations: null })) };
    },
  };
});
afterEach(() => {
  state.countFails = false;
});

const texts = (db: Db, jobId: number) => eventsSince(db, jobId, 0).map((e) => [e.kind, e.text]);

function claimRetention(db: Db, day = "2026-10-02") {
  enqueueJob(db, "retention", { day }, null);
  const job = claimNextJob(db);
  if (!job) throw new Error("no job claimed");
  return job;
}

function setup(scans = 41, pages = 1000, over: Partial<OpsJobDeps> = {}) {
  const db = openTestDb();
  addScans(db, "acme-docs", scans, { pages });
  const deps: OpsJobDeps = {
    db,
    config: parseConfig({
      HARBOUR_ALLOWED_LOGINS: "owner@example.com",
      HARBOUR_ORIGIN: "http://localhost:3400",
      HARBOUR_RP_ID: "localhost",
    }),
    productIds: () => ["acme-docs"],
    now: () => new Date("2026-10-02T02:20:00Z"),
    stopping: () => false,
    ...over,
  };
  return { deps, db, job: claimRetention(db) };
}

describe("runRetentionJob", () => {
  it("prunes old observations and says how many, per product", async () => {
    const { deps, db, job } = setup();
    await runRetentionJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "ok", error: null });
    expect(texts(db, job.id)).toEqual([
      ["status", "acme-docs: 11 old scans, 11,000 observations"],
      ["status", "Removed 11,000 observations from 11 scans"],
    ]);
    expect(scansWithObservations(db)[0]).toBe(12);
  });

  it("says when there is nothing to prune", async () => {
    const { deps, db, job } = setup();
    await runRetentionJob(deps, job);
    const again = claimRetention(db, "2026-10-03");
    await runRetentionJob(deps, again);
    expect(texts(db, again.id)).toEqual([
      ["status", "No old scans to prune (newest 30 kept, plus the latest result of each source)"],
    ]);
  });

  it("stops at the row limit and leaves the rest for the next night", async () => {
    const { deps, db, job } = setup(41, 1000, { retention: { batchRows: 1000, maxBatches: 2 } });
    await runRetentionJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "ok", error: null });
    expect(texts(db, job.id)).toEqual([
      ["status", "acme-docs: 11 old scans, 11,000 observations"],
      ["status", "Removed 2,000 observations from 2 scans"],
      ["status", "Stopped at the 2,000-row limit; the rest goes after tomorrow's backup"],
    ]);
    expect(scansWithObservations(db)[0]).toBe(3);
  });

  it("says when the plan was cut at 500 scans", async () => {
    const { deps, db, job } = setup(531, 1);
    await runRetentionJob(deps, job);
    expect(texts(db, job.id)).toEqual([
      ["status", "acme-docs: 500 old scans, 500 observations"],
      ["status", "Removed 500 observations from 500 scans"],
      ["status", "Pruned the oldest 500 scans; the rest goes after tomorrow's backup"],
    ]);
    expect(scansWithObservations(db)[0]).toBe(501);
  });

  it("says when the observations could not be counted, and still prunes", async () => {
    const { deps, db, job } = setup();
    state.countFails = true;
    await runRetentionJob(deps, job);
    expect(texts(db, job.id)).toEqual([
      ["status", "acme-docs: 11 old scans, observations not counted"],
      ["status", "Removed 11,000 observations from 11 scans"],
    ]);
  });

  it("fails the job with the reason, and leaves the rest for the next night", async () => {
    const { deps, db, job } = setup();
    connectionOf(db).exec("DROP TABLE observations");
    await runRetentionJob(deps, job);
    const row = getJob(db, job.id);
    expect(row).toMatchObject({ status: "failed", error: expect.stringMatching(/observations/) });
    expect(texts(db, job.id).at(-1)).toEqual(["error", row?.error]);
  });

  it("finishes cancelled when the worker stops", async () => {
    const { deps, db, job } = setup(41, 1000, { stopping: () => true });
    await runRetentionJob(deps, job);
    expect(getJob(db, job.id)).toMatchObject({ status: "cancelled", error: "Worker stopped" });
    expect(texts(db, job.id).at(-1)).toEqual(["status", "Worker stopped"]);
    expect(scansWithObservations(db)[0]).toBe(1);
  });
});
