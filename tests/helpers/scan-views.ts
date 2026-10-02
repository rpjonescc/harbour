/** Seeds finished scans (collector runs, observations, scores) for view and page tests. */
import type { Db } from "@/lib/db/client";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import {
  finishScan,
  recordCollectorRun,
  type ScanStatus,
  startScan,
  storeScores,
} from "@/lib/scan/store";
import type { CollectorStatus, Observation } from "@/lib/scan/types";

export const DAY = 24 * 60 * 60_000;
export const T0 = new Date("2026-10-01T06:00:00Z");
export const daysAfter = (n: number) => new Date(T0.getTime() + n * DAY);

export type SeedRun = {
  collector: string;
  status: CollectorStatus;
  error?: string;
  observations?: Observation[];
};

export type SeedScan = {
  productId: string;
  at: Date;
  status?: ScanStatus;
  runs?: SeedRun[];
  totals?: { seo: number | null; geo: number | null; aeo: number | null };
  complete?: { seo: boolean; geo: boolean; aeo: boolean };
  breakdown?: ScoreBreakdownEntry[];
  /** Defaults to "v1". */
  formulaVersion?: string;
  /** False stores no score row (as for a scan the worker stopped). */
  scored?: boolean;
};

/** Stores one finished scan; returns its id. */
export function seedScan(db: Db, scan: SeedScan): number {
  const { id: jobId } = enqueueJob(db, "scan", { productId: scan.productId }, null, scan.at);
  claimNextJob(db, scan.at);
  const scanId = startScan(db, scan.productId, jobId, scan.at);
  for (const run of scan.runs ?? []) {
    recordCollectorRun(db, {
      scanId,
      collector: run.collector,
      status: run.status,
      error: run.status === "ok" ? null : (run.error ?? "why"),
      startedAt: scan.at,
      finishedAt: scan.at,
      observations: run.observations,
    });
  }
  const status = scan.status ?? "ok";
  finishScan(db, scanId, status, scan.at);
  const failed = status === "failed";
  finishJob(db, jobId, failed ? "failed" : "ok", failed ? "All collectors failed" : null, scan.at);
  if (scan.scored === false) return scanId;
  storeScores(
    db,
    scanId,
    scan.productId,
    {
      formulaVersion: scan.formulaVersion ?? "v1",
      ...(scan.totals ?? { seo: 50, geo: 40, aeo: 30 }),
      complete: scan.complete ?? { seo: true, geo: true, aeo: true },
      breakdown: scan.breakdown ?? [],
    },
    scan.at,
  );
  return scanId;
}
