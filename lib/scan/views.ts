import { and, asc, desc, eq, gte, inArray, max, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { collectorRuns, jobs, type ScoreBreakdownEntry, scanRuns, scores } from "@/lib/db/schema";
import type { CollectorStatus } from "./types";

export type AreaKey = "seo" | "geo" | "aeo";
export const AREA_KEYS: readonly AreaKey[] = ["seo", "geo", "aeo"];
export type AreaValues<T> = Record<AreaKey, T>;

export type ScoreSnapshot = {
  scanId: number;
  computedAt: Date;
  formulaVersion: string;
  totals: AreaValues<number | null>;
  complete: AreaValues<boolean>;
  breakdown: ScoreBreakdownEntry[];
};

/** A product's latest scores, the change since the scan before, and its 30-day SEO series. */
export type ScoreTrend = {
  latest: ScoreSnapshot | null;
  /** Null when either scan has no number for that score. */
  deltas: AreaValues<number | null>;
  trend: number[];
};

export type ScanState = {
  /** A scan job queued or running for the product, from the jobs table. */
  active: { jobId: number; status: "queued" | "running"; since: Date } | null;
  /** The product's most recent scan that has finished. */
  last: {
    scanId: number;
    status: "ok" | "partial" | "failed";
    startedAt: Date;
    finishedAt: Date | null;
    /** The job's error, e.g. "All collectors failed". */
    error: string | null;
    failedCollectors: { collector: string; error: string | null }[];
  } | null;
};

export type CollectorRunView = {
  collector: string;
  status: CollectorStatus;
  error: string | null;
  finishedAt: Date;
};

const TREND_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
// Only scans that produced something: a failed scan never hides the last good scores.
const GOOD = inArray(scanRuns.status, ["ok", "partial"]);

function scoreRows(db: Db, productId: string, since?: Date) {
  return db
    .select({
      scanId: scores.scanId,
      computedAt: scores.computedAt,
      formulaVersion: scores.formulaVersion,
      seo: scores.seo,
      geo: scores.geo,
      aeo: scores.aeo,
      complete: scores.complete,
      breakdown: scores.breakdown,
    })
    .from(scores)
    .innerJoin(scanRuns, eq(scores.scanId, scanRuns.id))
    .where(
      and(eq(scores.productId, productId), GOOD, since ? gte(scores.computedAt, since) : undefined),
    );
}

type ScoreRow = ReturnType<ReturnType<typeof scoreRows>["all"]>[number];

function snapshot(row: ScoreRow): ScoreSnapshot {
  const { seo, geo, aeo, ...rest } = row;
  return { ...rest, totals: { seo, geo, aeo } };
}

const delta = (now: number | null | undefined, before: number | null | undefined) =>
  now == null || before == null ? null : now - before;

/** Latest scores of a product's good scans, deltas against the one before, and the SEO trend. */
export function productScoreTrend(db: Db, productId: string, now: Date): ScoreTrend {
  const [latest, previous] = scoreRows(db, productId)
    .orderBy(desc(scores.computedAt), desc(scores.id))
    .limit(2)
    .all();
  const since = new Date(now.getTime() - TREND_DAYS * DAY_MS);
  const trend = scoreRows(db, productId, since)
    .orderBy(asc(scores.computedAt), asc(scores.id))
    .all()
    .flatMap((row) => (row.seo === null ? [] : [row.seo]));
  return {
    latest: latest ? snapshot(latest) : null,
    deltas: {
      seo: delta(latest?.seo, previous?.seo),
      geo: delta(latest?.geo, previous?.geo),
      aeo: delta(latest?.aeo, previous?.aeo),
    },
    trend,
  };
}

const forProduct = (productId: string) =>
  sql`json_extract(${jobs.params}, '$.productId') = ${productId}`;

function activeScan(db: Db, productId: string): ScanState["active"] {
  const job = db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.kind, "scan"),
        inArray(jobs.status, ["queued", "running"]),
        forProduct(productId),
      ),
    )
    .orderBy(asc(jobs.id))
    .get();
  if (!job || (job.status !== "queued" && job.status !== "running")) return null;
  const since = job.status === "running" ? (job.startedAt ?? job.createdAt) : job.createdAt;
  return { jobId: job.id, status: job.status, since };
}

/** Whether a scan is queued or running for the product, and how its last scan ended. */
export function scanState(db: Db, productId: string): ScanState {
  const active = activeScan(db, productId);
  const last = db
    .select({
      scanId: scanRuns.id,
      status: scanRuns.status,
      startedAt: scanRuns.startedAt,
      finishedAt: scanRuns.finishedAt,
      error: jobs.error,
    })
    .from(scanRuns)
    .innerJoin(jobs, eq(scanRuns.jobId, jobs.id))
    .where(
      and(eq(scanRuns.productId, productId), inArray(scanRuns.status, ["ok", "partial", "failed"])),
    )
    .orderBy(desc(scanRuns.id))
    .get();
  // The query already leaves running scans out; the check narrows `status` for the type.
  if (!last || last.status === "running") return { active, last: null };
  const failedCollectors = scanCollectorRuns(db, last.scanId)
    .filter((run) => run.status === "failed")
    .map(({ collector, error }) => ({ collector, error }));
  return { active, last: { ...last, status: last.status, failedCollectors } };
}

/** Every collector run of one scan, in the order they ran. */
export function scanCollectorRuns(db: Db, scanId: number): CollectorRunView[] {
  return db
    .select({
      collector: collectorRuns.collector,
      status: collectorRuns.status,
      error: collectorRuns.error,
      finishedAt: collectorRuns.finishedAt,
    })
    .from(collectorRuns)
    .where(eq(collectorRuns.scanId, scanId))
    .orderBy(asc(collectorRuns.id))
    .all();
}

/** Each collector's most recent run for a product, in collector order of first appearance. */
export function latestCollectorRuns(db: Db, productId: string): CollectorRunView[] {
  const latestIds = db
    .select({ id: max(collectorRuns.id) })
    .from(collectorRuns)
    .innerJoin(scanRuns, eq(collectorRuns.scanId, scanRuns.id))
    .where(eq(scanRuns.productId, productId))
    .groupBy(collectorRuns.collector);
  return db
    .select({
      collector: collectorRuns.collector,
      status: collectorRuns.status,
      error: collectorRuns.error,
      finishedAt: collectorRuns.finishedAt,
    })
    .from(collectorRuns)
    .where(inArray(collectorRuns.id, latestIds))
    .orderBy(asc(collectorRuns.id))
    .all();
}

/** When the product's newest scan job was created (scheduled or by hand), or null. */
export function latestScanJobAt(db: Db, productId: string): Date | null {
  const row = db
    .select({ at: max(jobs.createdAt) })
    .from(jobs)
    .where(and(eq(jobs.kind, "scan"), forProduct(productId)))
    .get();
  return row?.at ?? null;
}
