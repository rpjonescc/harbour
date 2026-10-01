/** Scan history for retention tests, built with the real scan store functions. */
import { count } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { collectorRuns, observations, scanRuns, scores } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { finishScan, recordCollectorRun, startScan, storeScores } from "@/lib/scan/store";

const t0 = new Date("2026-08-01T06:00:00Z");
const DAY = 24 * 60 * 60_000;

export type ScanSpec = {
  /** Crawler page observations stored (default 3). */
  pages?: number;
  /** PageSpeed ran ok in this scan (2 observations); otherwise it is skipped. */
  pagespeed?: boolean;
  /** "running" leaves the scan open. */
  status?: "ok" | "failed" | "running";
};

/** Adds `n` daily scans of `productId` after any it already has; returns their ids. */
export function addScans(db: Db, productId: string, n: number, spec: ScanSpec = {}): number[] {
  const job = enqueueJob(db, "scan", { productId }, null, t0).id;
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = db.select({ n: count() }).from(scanRuns).get()?.n ?? 0;
    const at = new Date(t0.getTime() + before * DAY);
    const scanId = startScan(db, productId, job, at);
    const pages = spec.pages ?? 3;
    recordCollectorRun(db, {
      scanId,
      collector: "crawler",
      status: "ok",
      error: null,
      startedAt: at,
      finishedAt: at,
      observations: Array.from({ length: pages }, (_, p) => ({
        kind: "page",
        subject: `https://docs.example.com/${p}`,
        value: { status: 200 },
      })),
    });
    recordCollectorRun(db, {
      scanId,
      collector: "pagespeed",
      status: spec.pagespeed ? "ok" : "skipped",
      error: spec.pagespeed ? null : "weekly",
      startedAt: at,
      finishedAt: at,
      observations: spec.pagespeed
        ? [
            { kind: "cwv", subject: "mobile", value: { lcp: 2100 } },
            { kind: "cwv", subject: "desktop", value: { lcp: 900 } },
          ]
        : [],
    });
    const status = spec.status ?? "ok";
    if (status !== "running") {
      finishScan(db, scanId, status, at);
      if (status === "ok") storeScores(db, scanId, productId, SCORES, at);
    }
    ids.push(scanId);
  }
  return ids;
}

const SCORES = {
  formulaVersion: "v1",
  seo: 70,
  geo: null,
  aeo: 50,
  complete: { seo: true, geo: false, aeo: true },
  breakdown: [],
};

/** Row counts of the scan tables. */
export function rowCounts(db: Db) {
  const n = (table: typeof observations | typeof scanRuns | typeof collectorRuns | typeof scores) =>
    db.select({ n: count() }).from(table).get()?.n ?? 0;
  return {
    observations: n(observations),
    scanRuns: n(scanRuns),
    collectorRuns: n(collectorRuns),
    scores: n(scores),
  };
}

/** Scan ids that still have observations, ascending. */
export function scansWithObservations(db: Db): number[] {
  return db
    .selectDistinct({ id: observations.scanId })
    .from(observations)
    .orderBy(observations.scanId)
    .all()
    .map((r) => r.id);
}
