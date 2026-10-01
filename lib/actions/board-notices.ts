import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs, proposals, scanRuns } from "@/lib/db/schema";

/** Prefix of a scan job's error when the scan was scored but its rule-action sync threw. */
export const ACTION_SYNC_FAILED = "Action sync failed";

type ProductRef = { id: string; name: string };

/**
 * Products whose latest finished scan job failed only at the action sync (the scan itself
 * was ok or partial), so their actions may be out of date; with when the job finished.
 */
export function syncFailures(
  db: Db,
  products: readonly ProductRef[],
): { productName: string; at: Date }[] {
  return products.flatMap((product) => {
    const latest = db
      .select({
        status: jobs.status,
        error: jobs.error,
        finishedAt: jobs.finishedAt,
        scanStatus: scanRuns.status,
      })
      .from(jobs)
      .leftJoin(scanRuns, eq(scanRuns.jobId, jobs.id))
      .where(
        and(
          eq(jobs.kind, "scan"),
          inArray(jobs.status, ["ok", "failed", "cancelled"]),
          sql`json_extract(${jobs.params}, '$.productId') = ${product.id}`,
        ),
      )
      .orderBy(desc(jobs.id))
      .get();
    if (latest?.status !== "failed" || !latest.finishedAt) return [];
    if (!latest.error?.startsWith(ACTION_SYNC_FAILED)) return [];
    if (latest.scanStatus !== "ok" && latest.scanStatus !== "partial") return [];
    return [{ productName: product.name, at: latest.finishedAt }];
  });
}

/** Configured products with research targets (keywords, questions, competitors) awaiting approval. */
export function approvalsWaiting(
  db: Db,
  products: readonly ProductRef[],
): { productId: string; productName: string; count: number }[] {
  if (products.length === 0) return [];
  const rows = db
    .select({ productId: proposals.productId, n: count() })
    .from(proposals)
    .where(
      and(
        eq(proposals.status, "proposed"),
        inArray(
          proposals.productId,
          products.map((p) => p.id),
        ),
      ),
    )
    .groupBy(proposals.productId)
    .all();
  const counts = new Map(rows.map((row) => [row.productId, row.n]));
  return products.flatMap((product) => {
    const n = counts.get(product.id) ?? 0;
    return n > 0 ? [{ productId: product.id, productName: product.name, count: n }] : [];
  });
}
