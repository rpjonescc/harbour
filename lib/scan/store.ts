import { and, desc, eq, inArray, max, ne } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { collectorRuns, jobs, observations, scanRuns, scores } from "@/lib/db/schema";
import type {
  CollectorStatus,
  Observation,
  ScanObservation,
  ScanScores,
  ScoreContext,
} from "./types";

export type ScanStatus = "ok" | "partial" | "failed";

// Rows per INSERT statement, well under SQLite's bound-parameter limit.
const INSERT_CHUNK = 500;

/** Opens a running scan for a product and returns its id. */
export function startScan(db: Db, productId: string, jobId: number, now: Date): number {
  return db
    .insert(scanRuns)
    .values({ productId, jobId, startedAt: now, status: "running" })
    .returning({ id: scanRuns.id })
    .get().id;
}

export function finishScan(db: Db, scanId: number, status: ScanStatus, now: Date): void {
  db.update(scanRuns).set({ status, finishedAt: now }).where(eq(scanRuns.id, scanId)).run();
}

export type CollectorRunRecord = {
  scanId: number;
  collector: string;
  status: CollectorStatus;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
  observations?: readonly Observation[];
};

/** Records a collector's run and its observations together, or neither. */
export function recordCollectorRun(db: Db, run: CollectorRunRecord): void {
  const rows = (run.observations ?? []).map((o) => ({
    scanId: run.scanId,
    collector: run.collector,
    kind: o.kind,
    subject: o.subject,
    value: o.value,
  }));
  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      tx.insert(observations)
        .values(rows.slice(i, i + INSERT_CHUNK))
        .run();
    }
    tx.insert(collectorRuns)
      .values({
        scanId: run.scanId,
        collector: run.collector,
        status: run.status,
        error: run.error,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        items: run.status === "ok" ? rows.length : null,
      })
      .run();
  });
}

/** A collector's latest ok run for a product (newest finish), or undefined if it never ran ok. */
export function latestOkRun(db: Db, productId: string, collector: string) {
  return db
    .select({ scanId: collectorRuns.scanId, finishedAt: collectorRuns.finishedAt })
    .from(collectorRuns)
    .innerJoin(scanRuns, eq(collectorRuns.scanId, scanRuns.id))
    .where(
      and(
        eq(scanRuns.productId, productId),
        eq(collectorRuns.collector, collector),
        eq(collectorRuns.status, "ok"),
      ),
    )
    .orderBy(desc(collectorRuns.finishedAt), desc(collectorRuns.id))
    .get();
}

/** When a collector last finished ok for a product, or null if never. */
export function lastOkRunAt(db: Db, productId: string, collector: string): Date | null {
  return latestOkRun(db, productId, collector)?.finishedAt ?? null;
}

/**
 * What a collector observed in its latest ok run for a product (e.g. a weekly collector that
 * was skipped in the current scan), or null if it never ran ok.
 */
export function latestOkObservations(
  db: Db,
  productId: string,
  collector: string,
): { observations: Observation[]; finishedAt: Date } | null {
  const run = latestOkRun(db, productId, collector);
  if (!run) return null;
  return {
    observations: collectorObservations(db, run.scanId, collector),
    finishedAt: run.finishedAt,
  };
}

/** What one collector stored in a scan, in insertion order. */
export function collectorObservations(db: Db, scanId: number, collector: string): Observation[] {
  return db
    .select({ kind: observations.kind, subject: observations.subject, value: observations.value })
    .from(observations)
    .where(and(eq(observations.scanId, scanId), eq(observations.collector, collector)))
    .orderBy(observations.id)
    .all();
}

/** Every observation a scan stored, with its collector. */
export function scanObservations(db: Db, scanId: number): ScanObservation[] {
  return db
    .select({
      collector: observations.collector,
      kind: observations.kind,
      subject: observations.subject,
      value: observations.value,
    })
    .from(observations)
    .where(eq(observations.scanId, scanId))
    .orderBy(observations.id)
    .all();
}

/**
 * Stores a scan's scores; a scan is scored once and the row never changes: scoring it again
 * stores nothing and returns false.
 */
export function storeScores(
  db: Db,
  scanId: number,
  productId: string,
  result: ScanScores,
  now: Date,
): boolean {
  const inserted = db
    .insert(scores)
    .values({
      scanId,
      productId,
      computedAt: now,
      formulaVersion: result.formulaVersion,
      seo: result.seo,
      geo: result.geo,
      aeo: result.aeo,
      complete: result.complete,
      breakdown: result.breakdown,
    })
    .onConflictDoNothing({ target: scores.scanId })
    .returning({ id: scores.id })
    .all();
  return inserted.length > 0;
}

/**
 * What scoring reads besides the scan's observations: the time, and PageSpeed's last ok result
 * when this scan skipped it for its weekly cadence (the scorer judges its age).
 */
export function scoreContext(
  db: Db,
  productId: string,
  statuses: Readonly<Record<string, CollectorStatus>>,
  now: Date,
): ScoreContext {
  const skipped = statuses.pagespeed === "skipped";
  return {
    now,
    previousPagespeed: skipped ? latestOkObservations(db, productId, "pagespeed") : null,
  };
}

/**
 * Marks scans still "running" whose job is no longer running (failed or cancelled by recovery
 * after the worker stopped) as failed. Safe to call at any time.
 */
export function failInterruptedScans(db: Db, now = new Date()): number {
  const endedJobs = db.select({ id: jobs.id }).from(jobs).where(ne(jobs.status, "running"));
  return db
    .update(scanRuns)
    .set({ status: "failed", finishedAt: now })
    .where(and(eq(scanRuns.status, "running"), inArray(scanRuns.jobId, endedJobs)))
    .returning({ id: scanRuns.id })
    .all().length;
}

/** When the product's last ok or partial scan finished, or null if it never had one. */
export function lastGoodScanAt(db: Db, productId: string): Date | null {
  const row = db
    .select({ at: max(scanRuns.finishedAt) })
    .from(scanRuns)
    .where(and(eq(scanRuns.productId, productId), inArray(scanRuns.status, ["ok", "partial"])))
    .get();
  return row?.at ?? null;
}

/** The id of the product's latest ok or partial scan, or null if it never had one. */
export function latestGoodScanId(db: Db, productId: string): number | null {
  const row = db
    .select({ id: max(scanRuns.id) })
    .from(scanRuns)
    .where(and(eq(scanRuns.productId, productId), inArray(scanRuns.status, ["ok", "partial"])))
    .get();
  return row?.id ?? null;
}
