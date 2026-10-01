import { connectionOf, type Db } from "@/lib/db/client";
import { scoreContext } from "@/lib/scan/store";
import { openTestDb } from "@/tests/helpers/db";
import { addScans, rowCounts, scansWithObservations } from "@/tests/helpers/retention";
import { applyRetention, planRetention } from "./retention";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
type Opts = Partial<Parameters<typeof applyRetention>[2]>;
const apply = (db: Db, keep = 30, opts: Opts = {}) =>
  applyRetention(db, planRetention(db, keep), { stopping: () => false, ...opts });

describe("planRetention", () => {
  it("plans the observations of all but the newest 30 scans, oldest first", () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 35);
    expect(planRetention(db, 30)).toEqual({
      keep: 30,
      truncated: false,
      products: [
        {
          productId: "acme-docs",
          scans: 35,
          keptForHistory: 30,
          keptForCarryOver: 0,
          pruneScanIds: [1, 2, 3, 4, 5],
          observations: 15,
        },
      ],
    });
  });

  it("keeps an old scan holding a collector's latest ok run", () => {
    const db = openTestDb();
    const [first] = addScans(db, "acme-docs", 1, { pagespeed: true });
    addScans(db, "acme-docs", 34);
    const [plan] = planRetention(db, 30).products;
    expect(plan).toMatchObject({ keptForCarryOver: 1, pruneScanIds: [2, 3, 4, 5] });
    expect(plan?.pruneScanIds).not.toContain(first);
  });

  it("never plans a running scan", () => {
    const db = openTestDb();
    const [running] = addScans(db, "acme-docs", 1, { status: "running" });
    addScans(db, "acme-docs", 31);
    const [plan] = planRetention(db, 30).products;
    expect(plan?.pruneScanIds).toEqual([2]);
    expect(plan?.keptForCarryOver).toBe(1);
    expect(plan?.pruneScanIds).not.toContain(running);
  });

  it("keeps the scan behind the latest scores when every newer scan failed", () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 2);
    addScans(db, "acme-docs", 30, { status: "failed" });
    const [plan] = planRetention(db, 30).products;
    expect(plan).toMatchObject({ keptForCarryOver: 1, pruneScanIds: [1] });
  });

  it("plans each product separately, configured or not", () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 32);
    addScans(db, "retired-docs", 31, { pages: 5 });
    expect(planRetention(db, 30).products).toEqual([
      expect.objectContaining({ productId: "acme-docs", scans: 32, pruneScanIds: [1, 2] }),
      expect.objectContaining({
        productId: "retired-docs",
        scans: 31,
        pruneScanIds: [33],
        observations: 5,
      }),
    ]);
  });

  it("plans at most 500 scans and says so", () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 510, { pages: 1 });
    const plan = planRetention(db, 7);
    expect(plan.truncated).toBe(true);
    expect(plan.products[0]?.pruneScanIds).toEqual(range(1, 500));
    expect(plan.products[0]?.observations).toBe(500);
  });

  it("only reads", () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 35);
    const changes = () => connectionOf(db).prepare("SELECT total_changes() AS n").get();
    const before = changes();
    planRetention(db, 30);
    expect(changes()).toEqual(before);
  });
});

describe("applyRetention", () => {
  it("deletes only the planned observations; scans, collector runs and scores stay", async () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 35);
    const before = rowCounts(db);
    expect(await apply(db)).toEqual({ deleted: 15, scans: 5, complete: true, stopped: false });
    expect(rowCounts(db)).toEqual({ ...before, observations: before.observations - 15 });
    expect(scansWithObservations(db)).toEqual(range(6, 35));
  });

  it("leaves the carried-over PageSpeed result readable by the scorer", async () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 1, { pagespeed: true });
    addScans(db, "acme-docs", 34);
    await apply(db);
    const context = scoreContext(db, "acme-docs", { pagespeed: "skipped" }, new Date());
    expect(context.previousPagespeed?.observations).toHaveLength(2);
  });

  it("plans nothing on a second run", async () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 35);
    await apply(db);
    expect(planRetention(db, 30).products[0]).toMatchObject({ pruneScanIds: [], observations: 0 });
    expect(await apply(db)).toEqual({ deleted: 0, scans: 0, complete: true, stopped: false });
  });

  it("stops at the batch limit and leaves the rest for the next run", async () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 35);
    expect(await apply(db, 30, { batchRows: 10, maxBatches: 1 })).toEqual({
      deleted: 10,
      scans: 3,
      complete: false,
      stopped: false,
    });
    expect(await apply(db, 30, { batchRows: 10, maxBatches: 1 })).toEqual({
      deleted: 5,
      scans: 2,
      complete: true,
      stopped: false,
    });
    expect(scansWithObservations(db)).toEqual(range(6, 35));
  });

  it("stops between batches when the worker stops", async () => {
    const db = openTestDb();
    addScans(db, "acme-docs", 35);
    let checks = 0;
    const result = await apply(db, 30, { batchRows: 4, stopping: () => checks++ >= 1 });
    expect(result).toEqual({ deleted: 4, scans: 1, complete: false, stopped: true });
  });
});
