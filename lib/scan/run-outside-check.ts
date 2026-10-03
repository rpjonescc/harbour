import { manualFailureText } from "@/lib/explain/treg";
import { describeCopy } from "@/lib/external/describe";
import { saveExternalChecks } from "@/lib/external/store";
import { addEvent, type EventKind, finishJob, type Job } from "@/lib/jobs/queue";
import { attemptCollector } from "./attempt-collector";
import { collectorLabel } from "./labels";
import type { ScanDeps } from "./run-scan";
import { watchForStop } from "./scan-bounds";
import { skipReason } from "./skip-reason";
import { partialOf, tregSummaryValue } from "./treg-shapes";
import type { Collector, CollectorResult } from "./types";

const COLLECTOR = "treg";
const STOPPED = "Worker stopped";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** How a run that answered something fell short, from its tally; null when it answered all. */
function partialOfResult(result: Extract<CollectorResult, { status: "ok" }>) {
  const tally = result.observations.find((o) => o.kind === "treg_summary");
  const parsed = tregSummaryValue.safeParse(tally?.value);
  return parsed.success ? partialOf(parsed.data) : null;
}

/**
 * The `outside-check` job: runs only the Treg collector for one product, by hand. It goes through
 * the same collector, spend guard and result checks as a scan (`attemptCollector`), skipping only
 * the cadence and backoff rules (the owner asked). It makes no scan: its checks go straight to the
 * history table, so the product's scores and latest scan are untouched. The job's `result` says
 * how it ended: "ok", "partial:<why>", "skipped" or "not_configured".
 */
export async function runOutsideCheck(deps: ScanDeps, job: Job): Promise<void> {
  const { db } = deps;
  const event = (kind: EventKind, text: string) => addEvent(db, job.id, kind, text, deps.now());
  const finish = (status: "ok" | "failed" | "cancelled", error?: string, result?: string) =>
    finishJob(db, job.id, status, error ?? null, deps.now(), result ?? null);
  const productId = job.params.productId ?? "";
  const product = deps.products.find((p) => p.id === productId);
  const collector: Collector | undefined = deps.collectors.find((c) => c.id === COLLECTOR);
  if (!product || !collector) {
    const why = product ? "The outside view is not available" : "Unknown product";
    event("error", why);
    finish("failed", why);
    return;
  }
  const label = collectorLabel(COLLECTOR);
  const keep = (result: CollectorResult) => {
    if (result.status !== "ok") {
      const what = result.status === "not_configured" ? "not connected" : "skipped";
      event("status", `${label}: ${what} — ${result.reason}`);
      finish("ok", result.reason, result.status);
      return;
    }
    const copied = saveExternalChecks(db, {
      productId,
      scanId: null,
      jobId: job.id,
      observations: result.observations,
    });
    event("status", describeCopy(copied));
    const partial = partialOfResult(result);
    if (partial) event("status", `${label}: partly checked (${partial})`);
    finish("ok", undefined, partial ? `partial:${partial}` : "ok");
  };

  const stop = watchForStop(deps, job.id);
  try {
    const skip = skipReason(deps, productId, collector, deps.now(), true);
    if (skip) {
      event("status", `${label}: skipped — ${skip}`);
      finish("ok", skip, "skipped");
      return;
    }
    keep(
      await attemptCollector({
        deps,
        collector,
        product,
        jobId: job.id,
        // No scan behind a manual check: the collector reads nothing from an earlier collector.
        scanId: 0,
        statuses: {},
        signal: stop.signal,
        event,
        manual: true,
      }),
    );
  } catch (error) {
    if (stop.signal.aborted) {
      const stoppedByWorker = stop.stoppedByWorker();
      event("status", stoppedByWorker ? STOPPED : "Cancelled");
      finish("cancelled", stoppedByWorker ? STOPPED : undefined);
    } else {
      const text = manualFailureText(message(error));
      event("error", `${label}: failed — ${text}`);
      finish("failed", text);
    }
  } finally {
    stop.dispose();
  }
}
