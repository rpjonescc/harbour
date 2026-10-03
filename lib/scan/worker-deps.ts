import { and, desc, eq } from "drizzle-orm";
import { syncRuleActions } from "@/lib/actions/rule-sync-store";
import { audToMicro } from "@/lib/costs/budget";
import { collectorRuns, scanRuns } from "@/lib/db/schema";
import { describeCopy } from "@/lib/external/describe";
import { readOutsideFacts } from "@/lib/external/read-facts";
import { saveExternalChecks } from "@/lib/external/store";
import { isoDateIn } from "@/lib/format/date";
import { getTracking } from "@/lib/products/catalog";
import { createSafeFetch } from "./fetch";
import { evaluateRules } from "./issues";
import { outboundHosts } from "./outbound-hosts";
import { COLLECTORS } from "./registry";
import type { AfterScoreInput, ScanDeps } from "./run-scan";
import { scoreScan } from "./score";
import { collectorObservations, latestGoodScanId, scanObservations } from "./store";
import type { Collector } from "./types";

type WorkerContext = Pick<ScanDeps, "db" | "config" | "products" | "now" | "stopping">;

/** Scans whose Treg checks are copied each time, so one that failed to copy is caught up next time. */
const RECENT_TREG_SCANS = 3;

/**
 * Copies the Treg checks of the product's latest scans into the history (a copy is idempotent, so
 * a scan whose copy failed is caught up by the next one). The job event says how many were kept and
 * how many of this scan's failed their shape; null when there is nothing to copy. A failure to copy
 * is reported, not thrown: the scan and its action sync stand.
 */
function keepChecks(context: WorkerContext, { product }: AfterScoreInput): string | null {
  const { db } = context;
  try {
    const recent = db
      .select({ scanId: collectorRuns.scanId, jobId: scanRuns.jobId })
      .from(collectorRuns)
      .innerJoin(scanRuns, eq(collectorRuns.scanId, scanRuns.id))
      .where(
        and(
          eq(scanRuns.productId, product.id),
          eq(collectorRuns.collector, "treg"),
          eq(collectorRuns.status, "ok"),
        ),
      )
      .orderBy(desc(collectorRuns.id))
      .limit(RECENT_TREG_SCANS)
      .all();
    if (recent.length === 0) return null;
    let written = 0;
    let dropped = 0;
    for (const [index, { scanId, jobId }] of recent.entries()) {
      const observations = collectorObservations(db, scanId, "treg");
      const copied = saveExternalChecks(db, { productId: product.id, scanId, jobId, observations });
      written += copied.written;
      if (index === 0) dropped = copied.dropped;
    }
    return describeCopy({ written, dropped });
  } catch (error) {
    console.error(`outside view: could not keep the checks of ${product.id}`, error);
    return "Outside view: could not keep the checks; they are kept at the next check";
  }
}

/** Brings the product's rule actions in line with a scored scan; returns the job event text. */
function syncActions(context: WorkerContext, { scanId, product, statuses }: AfterScoreInput) {
  const { db, now } = context;
  // The worker runs one job at a time, so scans are serialized and this one is normally the
  // latest; the guard keeps an older scan from ever undoing what a newer one found.
  if (latestGoodScanId(db, product.id) !== scanId) {
    return `Actions: not synced — scan ${scanId} is not the latest good scan of ${product.name}`;
  }
  const at = now();
  const outside = readOutsideFacts(db, product, getTracking(product.id)?.questions ?? [], at);
  const outcomes = evaluateRules(scanObservations(db, scanId), statuses, product.kind, outside);
  const scanDate = isoDateIn(context.config.HARBOUR_TIMEZONE, at);
  const counts = syncRuleActions(db, { productId: product.id, outcomes, scanDate, now: at });
  return `Actions: ${counts.created} new, ${counts.resolved} resolved, ${counts.reopened} reopened`;
}

/**
 * What the end-to-end tests' worker swaps in: its own collector list (the Treg collector pointed at
 * a fake server) and the host that fake lives on. Nothing in the settings reaches this: only
 * tests/e2e/worker.ts builds one, so the real key can never be sent anywhere but treg.to.
 */
export type WorkerTestSeams = {
  collectors: readonly Collector[];
  customHeaderHosts: readonly string[];
};

/** The scan dependencies the worker runs with in production. */
export function workerScanDeps(context: WorkerContext, seams?: WorkerTestSeams): ScanDeps {
  return {
    ...context,
    collectors: seams?.collectors ?? COLLECTORS,
    // One per scan: robots.txt is cached for the scan; the per-site limiter is process-wide.
    fetch: createSafeFetch({
      allowedHosts: outboundHosts(context.products),
      ...(seams ? { customHeaderHosts: seams.customHeaderHosts } : {}),
      // Only the E2E fixture site: config refuses this outside test mode on a loopback origin.
      allowLoopback: context.config.HARBOUR_SCAN_ALLOW_LOOPBACK,
    }),
    scoreScan,
    budget: {
      capMicroAud: audToMicro(context.config.HARBOUR_MONTHLY_BUDGET_AUD),
      timeZone: context.config.HARBOUR_TIMEZONE,
    },
    afterScore: (input) =>
      [keepChecks(context, input), syncActions(context, input)].filter(Boolean).join("; "),
  };
}
