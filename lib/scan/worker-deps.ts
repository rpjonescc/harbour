import { syncRuleActions } from "@/lib/actions/rule-sync-store";
import { audToMicro } from "@/lib/costs/budget";
import { isoDateIn } from "@/lib/format/date";
import { createSafeFetch } from "./fetch";
import { evaluateRules } from "./issues";
import { outboundHosts } from "./outbound-hosts";
import { COLLECTORS } from "./registry";
import type { AfterScoreInput, ScanDeps } from "./run-scan";
import { scoreScan } from "./score";
import { latestGoodScanId, scanObservations } from "./store";

type WorkerContext = Pick<ScanDeps, "db" | "config" | "products" | "now" | "stopping">;

/** Brings the product's rule actions in line with a scored scan; returns the job event text. */
function syncActions(context: WorkerContext, { scanId, product, statuses }: AfterScoreInput) {
  const { db, now } = context;
  // The worker runs one job at a time, so scans are serialized and this one is normally the
  // latest; the guard keeps an older scan from ever undoing what a newer one found.
  if (latestGoodScanId(db, product.id) !== scanId) {
    return `Actions: not synced — scan ${scanId} is not the latest good scan of ${product.name}`;
  }
  const outcomes = evaluateRules(scanObservations(db, scanId), statuses);
  const at = now();
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
    afterScore: (input) => syncActions(context, input),
  };
}
