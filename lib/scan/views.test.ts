import { claimNextJob, enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { DAY, daysAfter, seedScan, T0 } from "@/tests/helpers/scan-views";
import {
  formulaChange,
  latestCollectorRuns,
  latestScanJobAt,
  productScoreTrend,
  scanCollectorRuns,
  scanState,
} from "./views";

const totals = (seo: number | null, geo: number | null, aeo: number | null) => ({ seo, geo, aeo });

describe("productScoreTrend", () => {
  it("is empty for a product that was never scored", () => {
    const db = openTestDb();
    expect(productScoreTrend(db, "acme-docs", "product", T0)).toEqual({
      latest: null,
      deltas: { seo: null, geo: null, aeo: null },
      trend: [],
    });
  });

  it("returns the latest scores, deltas against the previous scan and a 30-day SEO series", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-40), totals: totals(10, 10, 10) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), totals: totals(50, 40, 30) });
    seedScan(db, { productId: "fern-and-field", at: daysAfter(-1), totals: totals(9, 9, 9) });
    const scanId = seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      totals: totals(55, 38, null),
      complete: { seo: true, geo: false, aeo: false },
    });
    const view = productScoreTrend(db, "acme-docs", "product", T0);
    expect(view.latest).toMatchObject({
      scanId,
      computedAt: daysAfter(-1),
      totals: { seo: 55, geo: 38, aeo: null },
      complete: { seo: true, geo: false, aeo: false },
    });
    // A delta needs both numbers: AEO has no score now, so it has no delta.
    expect(view.deltas).toEqual({ seo: 5, geo: -2, aeo: null });
    expect(view.trend).toEqual([50, 55]);
  });

  it("hides only the AEO change across the v2 formula on a product site: the rest still moved", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), totals: totals(50, 40, 60) });
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      totals: totals(52, 41, 47),
      formulaVersion: "v2",
    });
    expect(productScoreTrend(db, "acme-docs", "product", T0).deltas).toEqual({
      seo: 2,
      geo: 1,
      aeo: null,
    });
    // The next scan on the same formula compares AEO again.
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(0),
      totals: totals(53, 41, 49),
      formulaVersion: "v2",
    });
    expect(productScoreTrend(db, "acme-docs", "product", T0).deltas).toEqual({
      seo: 1,
      geo: 0,
      aeo: 2,
    });
  });

  it("keeps every change visible on a news site, whose v2 scores did not change", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-news", at: daysAfter(-2), totals: totals(50, 40, 60) });
    seedScan(db, {
      productId: "acme-news",
      at: daysAfter(-1),
      totals: totals(52, 41, 47),
      formulaVersion: "v2",
    });
    expect(productScoreTrend(db, "acme-news", "news", T0).deltas).toEqual({
      seo: 2,
      geo: 1,
      aeo: -13,
    });
  });

  it("hides every change across a formula nobody has described yet", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), totals: totals(50, 40, 60) });
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      totals: totals(52, 41, 47),
      formulaVersion: "v9",
    });
    expect(productScoreTrend(db, "acme-docs", "news", T0).deltas).toEqual({
      seo: null,
      geo: null,
      aeo: null,
    });
  });

  it("ignores failed scans, so a failed run never hides the last good scores", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), totals: totals(50, 40, 30) });
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      status: "failed",
      totals: totals(null, null, null),
    });
    const view = productScoreTrend(db, "acme-docs", "product", T0);
    expect(view.latest?.totals).toEqual({ seo: 50, geo: 40, aeo: 30 });
    expect(view.deltas).toEqual({ seo: null, geo: null, aeo: null });
  });

  it("leaves scans without an SEO score out of the trend", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-3), totals: totals(40, 1, 1) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), totals: totals(null, 1, 1) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), totals: totals(44, 1, 1) });
    expect(productScoreTrend(db, "acme-docs", "product", T0).trend).toEqual([40, 44]);
  });
});

describe("scanState", () => {
  it("is empty before the first scan", () => {
    expect(scanState(openTestDb(), "acme-docs")).toEqual({ active: null, last: null });
  });

  it("reports a queued or running scan job from the jobs table", () => {
    const db = openTestDb();
    const queued = enqueueJob(db, "scan", { productId: "acme-docs" }, null, T0);
    enqueueJob(db, "scan", { productId: "fern-and-field" }, null, T0);
    expect(scanState(db, "acme-docs").active).toEqual({
      jobId: queued.id,
      status: "queued",
      since: T0,
    });
    const later = new Date(T0.getTime() + 60_000);
    claimNextJob(db, later);
    expect(scanState(db, "acme-docs").active).toEqual({
      jobId: queued.id,
      status: "running",
      since: later,
    });
  });

  it("reports the last finished scan with the job's error and the collectors that failed", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2) });
    const id = seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      status: "failed",
      runs: [
        { collector: "crawler", status: "failed", error: "Could not crawl" },
        { collector: "pagespeed", status: "not_configured" },
      ],
    });
    expect(scanState(db, "acme-docs").last).toEqual({
      scanId: id,
      status: "failed",
      startedAt: daysAfter(-1),
      finishedAt: daysAfter(-1),
      error: "All collectors failed",
      failedCollectors: [{ collector: "crawler", error: "Could not crawl" }],
    });
  });
});

describe("collector runs", () => {
  it("lists each collector's latest run for a product", () => {
    const db = openTestDb();
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-2),
      runs: [
        { collector: "crawler", status: "failed", error: "timeout" },
        { collector: "pagespeed", status: "ok" },
      ],
    });
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      runs: [
        { collector: "crawler", status: "ok" },
        { collector: "pagespeed", status: "skipped", error: "ran 1 day ago" },
      ],
    });
    seedScan(db, {
      productId: "fern-and-field",
      at: T0,
      runs: [{ collector: "crawler", status: "failed" }],
    });
    expect(latestCollectorRuns(db, "acme-docs")).toEqual([
      { collector: "crawler", status: "ok", error: null, finishedAt: daysAfter(-1) },
      {
        collector: "pagespeed",
        status: "skipped",
        error: "ran 1 day ago",
        finishedAt: daysAfter(-1),
      },
    ]);
  });

  it("lists one scan's runs in the order they ran", () => {
    const db = openTestDb();
    const scanId = seedScan(db, {
      productId: "acme-docs",
      at: T0,
      runs: [
        { collector: "crawler", status: "ok" },
        { collector: "search-console", status: "not_configured", error: "no credentials" },
      ],
    });
    expect(scanCollectorRuns(db, scanId).map((r) => [r.collector, r.status, r.error])).toEqual([
      ["crawler", "ok", null],
      ["search-console", "not_configured", "no credentials"],
    ]);
  });
});

describe("latestScanJobAt", () => {
  it("is when the product's newest scan job was created, by anyone", () => {
    const db = openTestDb();
    expect(latestScanJobAt(db, "acme-docs")).toBeNull();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1) });
    enqueueJob(db, "scan", { productId: "acme-docs" }, "owner@example.com", T0);
    enqueueJob(db, "scan", { productId: "fern-and-field" }, null, new Date(T0.getTime() + DAY));
    expect(latestScanJobAt(db, "acme-docs")).toEqual(T0);
  });
});

describe("formulaChange", () => {
  it("is null while every score in the window used the same formula", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-3), formulaVersion: "v2" });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), formulaVersion: "v2" });
    expect(formulaChange(db, "acme-docs", T0)).toBeNull();
  });

  it("names the first score on the new formula", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-3) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), formulaVersion: "v2" });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), formulaVersion: "v2" });
    expect(formulaChange(db, "acme-docs", T0)).toEqual({
      from: "v1",
      to: "v2",
      at: daysAfter(-2),
    });
  });

  it("falls back to the newest change that has a note when a later formula has none", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-3) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), formulaVersion: "v2" });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), formulaVersion: "v3" });
    expect(formulaChange(db, "acme-docs", T0)).toEqual({
      from: "v1",
      to: "v2",
      at: daysAfter(-2),
    });
  });

  it("forgets a change that has left the 30-day window, and ignores other products and failed scans", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-50) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-45), formulaVersion: "v2" });
    seedScan(db, { productId: "fern-and-field", at: daysAfter(-2) });
    seedScan(db, { productId: "fern-and-field", at: daysAfter(-1), formulaVersion: "v2" });
    seedScan(db, {
      productId: "acme-docs",
      at: daysAfter(-1),
      status: "failed",
      formulaVersion: "v9",
    });
    expect(formulaChange(db, "acme-docs", T0)).toBeNull();
  });
});
