import { syncRuleActions } from "@/lib/actions/rule-sync-store";
import { audToMicro } from "@/lib/costs/budget";
import { readOutsideFacts } from "@/lib/external/read-facts";
import { saveExternalChecks } from "@/lib/external/store";
import { isoDateIn } from "@/lib/format/date";
import { createSafeFetch } from "./fetch";
import { evaluateRules } from "./issues";
import { outboundHosts } from "./outbound-hosts";
import { COLLECTORS } from "./registry";
import type { AfterScoreInput, ScanDeps } from "./run-scan";
import { scoreScan } from "./score";
import { latestGoodScanId, scanObservations } from "./store";

type WorkerContext = Pick<ScanDeps, "db" | "config" | "products" | "now" | "stopping">;

/**
 * Copies the Treg checks this scan made into the history table; the job event says how many were
 * kept and how many failed their shape. Null when the scan made none.
 */
function keepChecks(context: WorkerContext, { scanId, product, jobId }: AfterScoreInput) {
  const made = scanObservations(context.db, scanId).filter((o) => o.collector === "treg");
  if (made.length === 0) return null;
  const copied = saveExternalChecks(context.db, {
    productId: product.id,
    scanId,
    jobId,
    observations: made,
  });
  const failed =
    copied.dropped > 0 ? `, ${copied.dropped} failed their shape and were dropped` : "";
  return `Outside view: kept ${copied.written} new ${copied.written === 1 ? "check" : "checks"}${failed}`;
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
  const outside = readOutsideFacts(db, product.id, at);
  const outcomes = evaluateRules(scanObservations(db, scanId), statuses, product.kind, outside);
  const scanDate = isoDateIn(context.config.HARBOUR_TIMEZONE, at);
  const counts = syncRuleActions(db, { productId: product.id, outcomes, scanDate, now: at });
  return `Actions: ${counts.created} new, ${counts.resolved} resolved, ${counts.reopened} reopened`;
}

/** The scan dependencies the worker runs with in production. */
export function workerScanDeps(context: WorkerContext): ScanDeps {
  return {
    ...context,
    collectors: COLLECTORS,
    // One per scan: robots.txt is cached for the scan; the per-site limiter is process-wide.
    fetch: createSafeFetch({
      allowedHosts: outboundHosts(context.products),
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
