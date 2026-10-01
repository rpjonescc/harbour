// Observation retention: deletes the raw observations of old scans, keeping everything a view,
// the scorer's carry-over or the dry run still reads. Worker only (planRetention is SELECT-only
// and also used by `pnpm retention:check`).

import { and, count, countDistinct, desc, eq, exists, inArray, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { collectorRuns, observations, scanRuns, scores } from "@/lib/db/schema";
import { COLLECTORS } from "@/lib/scan/registry";
import { plural } from "@/lib/scan/scoring/sub-score";
import { latestOkRun } from "@/lib/scan/store";

export type ProductRetention = {
  productId: string;
  scans: number; // scan_runs rows (all kept)
  keptForHistory: number; // newest N
  keptForCarryOver: number; // older scans kept because a reader still needs them
  pruneScanIds: number[]; // older scans that still have observations, oldest first
  observations: number | null; // rows to delete; null when the count failed (a gap)
};
export type RetentionPlan = { keep: number; products: ProductRetention[]; truncated: boolean };

/** Most scans one run plans (and so deletes from): keeps every IN list small. */
export const MAX_PLANNED_SCANS = 500;
/** Rows per DELETE statement and statements per run (500,000 rows). */
export const RETENTION_LIMITS = { batchRows: 2000, maxBatches: 250 };

const productIds = (db: Db) =>
  db
    .selectDistinct({ id: scanRuns.productId })
    .from(scanRuns)
    .orderBy(scanRuns.productId)
    .all()
    .map((r) => r.id);

/** The scan behind the product's latest scores: the product page and weekly export read it. */
function latestScoredScanId(db: Db, productId: string): number | undefined {
  return db
    .select({ id: scores.scanId })
    .from(scores)
    .innerJoin(scanRuns, eq(scores.scanId, scanRuns.id))
    .where(and(eq(scores.productId, productId), inArray(scanRuns.status, ["ok", "partial"])))
    .orderBy(desc(scores.computedAt), desc(scores.id))
    .get()?.id;
}

/**
 * Scans whose observations a reader may still need whatever their age: running ones, each
 * registered collector's latest ok run (carried into later scores, e.g. weekly PageSpeed), and
 * the scan behind the latest scores. A collector no longer registered is never carried over, so
 * its last run does not pin an old scan forever.
 */
function neededScanIds(db: Db, productId: string): Set<number> {
  const forProduct = eq(scanRuns.productId, productId);
  const needed = new Set(
    db
      .select({ id: scanRuns.id })
      .from(scanRuns)
      .where(and(forProduct, eq(scanRuns.status, "running")))
      .all()
      .map((r) => r.id),
  );
  const collectors = db
    .selectDistinct({ collector: collectorRuns.collector })
    .from(collectorRuns)
    .innerJoin(scanRuns, eq(collectorRuns.scanId, scanRuns.id))
    .where(
      and(
        forProduct,
        eq(collectorRuns.status, "ok"),
        inArray(
          collectorRuns.collector,
          COLLECTORS.map((c) => c.id),
        ),
      ),
    )
    .all();
  for (const { collector } of collectors) {
    const run = latestOkRun(db, productId, collector);
    if (run) needed.add(run.scanId);
  }
  const scored = latestScoredScanId(db, productId);
  if (scored !== undefined) needed.add(scored);
  return needed;
}

function countObservations(db: Db, scanIds: number[]): number | null {
  if (scanIds.length === 0) return 0;
  try {
    return (
      db
        .select({ n: count() })
        .from(observations)
        .where(inArray(observations.scanId, scanIds))
        .get()?.n ?? null
    );
  } catch {
    return null; // shown as "not counted", never as 0
  }
}

function planProduct(db: Db, productId: string, keep: number, budget: number) {
  const forProduct = eq(scanRuns.productId, productId);
  const scans = db.select({ n: count() }).from(scanRuns).where(forProduct).get()?.n ?? 0;
  const newest = db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(forProduct)
    .orderBy(desc(scanRuns.id))
    .limit(keep)
    .all();
  const oldestKept = newest.at(-1)?.id;
  const empty = { keptForCarryOver: 0, pruneScanIds: [], more: false };
  const older = scans > keep && oldestKept !== undefined ? oldestKept : null;
  const { keptForCarryOver, pruneScanIds, more } =
    older === null ? empty : pruneCandidates(db, productId, older, budget);
  const plan: ProductRetention = {
    productId,
    scans,
    keptForHistory: newest.length,
    keptForCarryOver,
    pruneScanIds,
    observations: countObservations(db, pruneScanIds),
  };
  return { plan, more };
}

/** Scans older than `before` that still have observations and no reader needs, oldest first. */
function pruneCandidates(db: Db, productId: string, before: number, budget: number) {
  const needed = [...neededScanIds(db, productId)].filter((id) => id < before);
  const hasObservations = exists(
    db
      .select({ one: observations.id })
      .from(observations)
      .where(eq(observations.scanId, scanRuns.id)),
  );
  const candidates = db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(and(eq(scanRuns.productId, productId), lt(scanRuns.id, before), hasObservations))
    .orderBy(scanRuns.id)
    .limit(budget + needed.length + 1)
    .all()
    .map((r) => r.id)
    .filter((id) => !needed.includes(id));
  return {
    keptForCarryOver: needed.length,
    pruneScanIds: candidates.slice(0, budget),
    more: candidates.length > budget,
  };
}

/** What retention would delete, per product found in scan_runs; SELECTs only. */
export function planRetention(db: Db, keep: number): RetentionPlan {
  let budget = MAX_PLANNED_SCANS;
  let truncated = false;
  const products = productIds(db).map((productId) => {
    const { plan, more } = planProduct(db, productId, keep, budget);
    budget -= plan.pruneScanIds.length;
    truncated ||= more;
    return plan;
  });
  return { keep, products, truncated };
}

function deleteBatch(db: Db, scanIds: number[], rows: number): number {
  const batch = db
    .select({ id: observations.id })
    .from(observations)
    .where(inArray(observations.scanId, scanIds))
    .orderBy(observations.id)
    .limit(rows);
  // One statement in its own (implicit) transaction, so the web's writes wait only for this.
  return db.delete(observations).where(inArray(observations.id, batch)).run().changes;
}

/**
 * Deletes the planned observations in batches of `batchRows`, yielding between statements;
 * stops after `maxBatches` (complete: false) or when `stopping()` (stopped: true).
 */
export async function applyRetention(
  db: Db,
  plan: RetentionPlan,
  opts: { batchRows?: number; maxBatches?: number; stopping: () => boolean },
): Promise<{ deleted: number; scans: number; complete: boolean; stopped: boolean }> {
  const { batchRows, maxBatches } = { ...RETENTION_LIMITS, ...opts };
  const { stopping } = opts;
  const scanIds = plan.products.flatMap((p) => p.pruneScanIds);
  let deleted = 0;
  let batches = 0;
  let complete = scanIds.length === 0;
  let stopped = false;
  while (!complete && batches < maxBatches) {
    if (stopping()) {
      stopped = true;
      break;
    }
    const removed = deleteBatch(db, scanIds, batchRows);
    deleted += removed;
    batches += 1;
    complete = removed < batchRows;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { deleted, scans: clearedScans(db, scanIds), complete, stopped };
}

function clearedScans(db: Db, scanIds: number[]): number {
  if (scanIds.length === 0) return 0;
  const left =
    db
      .select({ n: countDistinct(observations.scanId) })
      .from(observations)
      .where(inArray(observations.scanId, scanIds))
      .get()?.n ?? 0;
  return scanIds.length - left;
}

const num = (n: number) => n.toLocaleString("en-US");

/** "acme-docs: 11 old scans, 18,240 observations" (product id, so logs read the same anywhere). */
export function describeProductPlan(p: ProductRetention): string {
  const n = p.pruneScanIds.length;
  const rows =
    p.observations === null
      ? "observations not counted"
      : `${num(p.observations)} ${plural(p.observations, "observation")}`;
  return `${p.productId}: ${num(n)} old ${plural(n, "scan")}, ${rows}`;
}

/** "Removed 18,240 observations from 11 scans". */
export function describeRemoved(result: { deleted: number; scans: number }): string {
  return `Removed ${num(result.deleted)} ${plural(result.deleted, "observation")} from ${num(result.scans)} ${plural(result.scans, "scan")}`;
}
