import { makeSpend } from "@/lib/costs/guard";
import { saveExternalChecks } from "@/lib/external/store";
import { addEvent, type EventKind, finishJob, type Job } from "@/lib/jobs/queue";
import { collectContext } from "./collect-context";
import { collectorLabel } from "./labels";
import { collectorTimeoutMs } from "./registry";
import type { ScanDeps } from "./run-scan";
import { runBounded, watchForStop } from "./scan-bounds";
import { skipReason } from "./skip-reason";
import type { Collector, CollectorResult } from "./types";

const COLLECTOR = "treg";
const STOPPED = "Worker stopped";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The `outside-check` job: runs only the Treg collector for one product, by hand. It goes through
 * the same collector and budget guard as the weekly run, skipping only the cadence and backoff
 * rules (the owner asked). It makes no scan: its checks go straight to the history table, so the
 * product's scores and latest scan are untouched.
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
    const failed =
      copied.dropped > 0 ? `, ${copied.dropped} failed their shape and were dropped` : "";
    event("status", `Outside view: kept ${copied.written} new checks${failed}`);
    finish("ok", undefined, "ok");
  };

  const stop = watchForStop(deps, job.id);
  let returned = false;
  const spend = makeSpend(db, {
    ...deps.budget,
    now: deps.now,
    productId,
    collector: COLLECTOR,
    jobId: job.id,
    log: (text) => event("error", `${label}: ${text}`),
  });
  try {
    const skip = skipReason(deps, productId, collector, deps.now(), true);
    if (skip) {
      event("status", `${label}: skipped — ${skip}`);
      finish("ok", skip, "skipped");
      return;
    }
    // No scan behind a manual check: the collector reads nothing from an earlier collector.
    const ctx = (signal: AbortSignal) =>
      collectContext({
        deps,
        product,
        scanId: 0,
        statuses: {},
        log: (text) => event("status", `${label}: ${text}`),
        signal,
        spend,
        manual: true,
      });
    const run = runBounded(
      (signal) => collector.collect(ctx(signal)),
      collectorTimeoutMs(COLLECTOR),
      stop.signal,
    );
    const result: CollectorResult = await run.result;
    returned = true;
    const lost = spend.failure();
    if (lost) throw new Error(lost);
    keep(result);
  } catch (error) {
    if (stop.signal.aborted) {
      const stoppedByWorker = stop.stoppedByWorker();
      event("status", stoppedByWorker ? STOPPED : "Cancelled");
      finish("cancelled", stoppedByWorker ? STOPPED : undefined);
    } else {
      event("error", `${label}: failed — ${message(error)}`);
      finish("failed", message(error));
    }
  } finally {
    spend.release(returned ? "returned" : "threw");
    stop.dispose();
  }
}
