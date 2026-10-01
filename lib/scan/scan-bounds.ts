import type { Db } from "@/lib/db/client";
import { isCancelRequested } from "@/lib/jobs/queue";
import type { CollectorResult } from "./types";

// How a scan is bounded: a stop signal for cancel requests and worker shutdown, and a timeout
// per collector.

const POLL_MS = 1000;

function describeTimeout(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${ms / 1000} s`;
}

type StopDeps = {
  db: Db;
  /** True once the worker is shutting down. */
  stopping: () => boolean;
  /** How often to check for a cancel request. */
  pollMs?: number;
};

/** Aborts when the job is cancelled or the worker stops; checked on demand and by polling. */
export function watchForStop(deps: StopDeps, jobId: number) {
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
export function runBounded(
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
