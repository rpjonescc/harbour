import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { collectorRuns, observations, scanRuns, scores } from "@/lib/db/schema";
import type { CollectorStatus, Observation, ScanObservation, ScanScores } from "./types";

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

/** When a collector last finished ok for a product, or null if never. */
export function lastOkRunAt(db: Db, productId: string, collector: string): Date | null {
  const row = db
    .select({ finishedAt: collectorRuns.finishedAt })
    .from(collectorRuns)
    .innerJoin(scanRuns, eq(collectorRuns.scanId, scanRuns.id))
    .where(
      and(
        eq(scanRuns.productId, productId),
        eq(collectorRuns.collector, collector),
        eq(collectorRuns.status, "ok"),
      ),
    )
    .orderBy(desc(collectorRuns.finishedAt))
    .get();
  return row?.finishedAt ?? null;
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

/** Stores a scan's scores; a scan is scored once and the row never changes. */
export function storeScores(
  db: Db,
  scanId: number,
  productId: string,
  result: ScanScores,
  now: Date,
): void {
  db.insert(scores)
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
    .run();
}

/** At worker start every running scan is orphaned (its job was failed); mark it failed. */
export function failInterruptedScans(db: Db, now = new Date()): number {
  return db
    .update(scanRuns)
    .set({ status: "failed", finishedAt: now })
    .where(eq(scanRuns.status, "running"))
    .returning({ id: scanRuns.id })
    .all().length;
}
