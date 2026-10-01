import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { addEvent, type EventKind, finishJob, isCancelRequested, type Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { collectorLabel, collectorTimeoutMs } from "./registry";
import {
  finishScan,
  lastOkRunAt,
  recordCollectorRun,
  type ScanStatus,
  scanObservations,
  startScan,
  storeScores,
} from "./store";
import type { Collector, CollectorResult, CollectorStatus, SafeFetch, ScoreScan } from "./types";

export type ScanDeps = {
  db: Db;
  config: Config;
  products: readonly Product[];
  /** Run in order; see `COLLECTORS`. */
  collectors: readonly Collector[];
  fetch: SafeFetch;
  scoreScan: ScoreScan;
  now: () => Date;
  /** True once the worker is shutting down: the scan stops like a cancel. */
  stopping: () => boolean;
  timeoutMs?: (collectorId: string) => number;
  /** How often to check for a cancel request while a collector runs. */
  pollMs?: number;
  /** Most observations one collector may store per scan. */
  maxObservations?: number;
};

const WEEK_MS = 7 * 24 * 60 * 60_000;
const POLL_MS = 1000;
const MAX_OBSERVATIONS = 20_000;
const STOPPED = "Worker stopped";

type Scan = {
  deps: ScanDeps;
  job: Job;
  product: Product;
  scanId: number;
  signal: AbortSignal;
  event: (kind: EventKind, text: string) => void;
};

/** Ok when nothing failed, failed when every collector failed, otherwise partial. */
export function scanStatusOf(statuses: readonly CollectorStatus[]): ScanStatus {
  const failed = statuses.filter((s) => s === "failed").length;
  if (failed === 0) return "ok";
  return failed === statuses.length ? "failed" : "partial";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeTimeout(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${ms / 1000} s`;
}

function finish(deps: ScanDeps, job: Job, status: "ok" | "failed" | "cancelled", error?: string) {
  if (!finishJob(deps.db, job.id, status, error ?? null, deps.now())) {
    console.warn(`job ${job.id} was no longer running; its result (${status}) was not recorded`);
  }
}

/** Aborts when the job is cancelled or the worker stops; checked on demand and by polling. */
function watchForStop(deps: ScanDeps, jobId: number) {
  const controller = new AbortController();
  let stoppedByWorker = false;
  const check = () => {
    if (controller.signal.aborted) return;
    try {
      stoppedByWorker = deps.stopping();
      if (stoppedByWorker || isCancelRequested(deps.db, jobId)) {
        controller.abort(new Error("Cancelled"));
      }
    } catch (error) {
      console.error(`job ${jobId}: cancel check failed`, error);
    }
  };
  const timer = setInterval(check, deps.pollMs ?? POLL_MS);
  return {
    signal: controller.signal,
    check,
    stoppedByWorker: () => stoppedByWorker,
    dispose: () => clearInterval(timer),
  };
}

/**
 * Runs `collect` under its own timeout and the scan's stop signal. A collector that ignores its
 * signal is abandoned: its late result is never recorded.
 */
function runBounded(
  collect: (signal: AbortSignal) => Promise<CollectorResult>,
  ms: number,
  parent: AbortSignal,
): { result: Promise<CollectorResult>; signal: AbortSignal } {
  const timeout = new AbortController();
  const signal = AbortSignal.any([parent, timeout.signal]);
  const timer = setTimeout(
    () => timeout.abort(new Error(`Timed out after ${describeTimeout(ms)}`)),
    ms,
  );
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const result = Promise.race([Promise.resolve().then(() => collect(signal)), aborted]);
  return { result: result.finally(() => clearTimeout(timer)), signal };
}

function weeklySkipReason(scan: Scan, collector: Collector, now: Date): string | null {
  if (collector.cadence !== "weekly") return null;
  const last = lastOkRunAt(scan.deps.db, scan.product.id, collector.id);
  if (!last || now.getTime() - last.getTime() >= WEEK_MS) return null;
  return `runs weekly; last ran ${last.toISOString().slice(0, 10)}`;
}

async function attempt(scan: Scan, collector: Collector): Promise<CollectorResult> {
  const { deps } = scan;
  const label = collectorLabel(collector.id);
  const timeoutMs = (deps.timeoutMs ?? collectorTimeoutMs)(collector.id);
  const run = runBounded(
    (signal) =>
      collector.collect({
        product: scan.product,
        config: deps.config,
        now: deps.now(),
        fetch: deps.fetch,
        log: (text) => scan.event("status", `${label}: ${text}`),
        signal,
      }),
    timeoutMs,
    scan.signal,
  );
  try {
    return await run.result;
  } catch (error) {
    // Prefer why we aborted (timeout, cancel) over the collector's own reaction to it.
    throw run.signal.aborted ? run.signal.reason : error;
  }
}

/** Runs one collector and records its outcome; never throws for a collector's own failure. */
async function runCollector(scan: Scan, collector: Collector): Promise<CollectorStatus> {
  const { deps, scanId } = scan;
  const label = collectorLabel(collector.id);
  const startedAt = deps.now();
  const record = (status: CollectorStatus, error: string | null, items?: CollectorResult) =>
    recordCollectorRun(deps.db, {
      scanId,
      collector: collector.id,
      status,
      error,
      startedAt,
      finishedAt: deps.now(),
      observations: items?.status === "ok" ? items.observations : undefined,
    });

  const skip = weeklySkipReason(scan, collector, startedAt);
  if (skip) {
    record("skipped", skip);
    scan.event("status", `${label}: skipped — ${skip}`);
    return "skipped";
  }
  let result: CollectorResult;
  try {
    result = await attempt(scan, collector);
    const max = deps.maxObservations ?? MAX_OBSERVATIONS;
    if (result.status === "ok" && result.observations.length > max) {
      throw new Error(`Returned ${result.observations.length} observations (limit ${max})`);
    }
  } catch (error) {
    record("failed", message(error));
    scan.event("error", `${label}: failed — ${message(error)}`);
    return "failed";
  }
  if (result.status === "ok") {
    record("ok", null, result);
    const n = result.observations.length;
    scan.event("status", `${label}: ${n} observation${n === 1 ? "" : "s"}`);
  } else {
    record(result.status, result.reason);
    const what = result.status === "not_configured" ? "not connected" : "skipped";
    scan.event("status", `${label}: ${what} — ${result.reason}`);
  }
  return result.status;
}

function scoreAndFinish(scan: Scan, statuses: Record<string, CollectorStatus>) {
  const { deps, job, scanId } = scan;
  const status = scanStatusOf(Object.values(statuses));
  finishScan(deps.db, scanId, status, deps.now());
  scan.event("status", `Scan ${status}`);
  try {
    const scores = deps.scoreScan(scanObservations(deps.db, scanId), statuses);
    if (scores) storeScores(deps.db, scanId, scan.product.id, scores, deps.now());
  } catch (error) {
    scan.event("error", `Scoring failed: ${message(error)}`);
    finish(deps, job, "failed", `Scoring failed: ${message(error)}`);
    return;
  }
  if (status === "failed") finish(deps, job, "failed", "All collectors failed");
  else finish(deps, job, "ok");
}

/** Runs every registered collector for the job's product, then scores the scan. */
export async function runScan(deps: ScanDeps, job: Job): Promise<void> {
  const event = (kind: EventKind, text: string) =>
    addEvent(deps.db, job.id, kind, text, deps.now());
  const productId = job.params.productId ?? "";
  const product = deps.products.find((p) => p.id === productId);
  if (!product) {
    event("error", `Unknown product: ${productId}`);
    finish(deps, job, "failed", `Unknown product: ${productId}`);
    return;
  }
  const scanId = startScan(deps.db, product.id, job.id, deps.now());
  const stop = watchForStop(deps, job.id);
  const scan: Scan = { deps, job, product, scanId, signal: stop.signal, event };
  try {
    const statuses: Record<string, CollectorStatus> = {};
    for (const collector of deps.collectors) {
      stop.check();
      if (stop.signal.aborted) break;
      statuses[collector.id] = await runCollector(scan, collector);
    }
    // Only a stop that interrupted a collector cancels; finished collectors are always scored.
    if (!stop.signal.aborted) return scoreAndFinish(scan, statuses);
    finishScan(deps.db, scanId, "failed", deps.now());
    const stopped = stop.stoppedByWorker();
    event("status", stopped ? STOPPED : "Cancelled");
    finish(deps, job, "cancelled", stopped ? STOPPED : undefined);
  } catch (error) {
    console.error(`job ${job.id}: scan crashed`, error);
    finishScan(deps.db, scanId, "failed", deps.now());
    event("error", `Scan failed: ${message(error)}`);
    finish(deps, job, "failed", message(error));
  } finally {
    stop.dispose();
  }
}
