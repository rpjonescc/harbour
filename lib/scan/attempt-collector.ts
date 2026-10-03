import { makeSpend, noSpend } from "@/lib/costs/guard";
import type { EventKind } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { collectContext } from "./collect-context";
import { collectorLabel } from "./labels";
import { collectorTimeoutMs } from "./registry";
import type { ScanDeps } from "./run-scan";
import { runBounded } from "./scan-bounds";
import type { Collector, CollectorResult, CollectorStatus } from "./types";

/** Most observations one collector may store per run. */
export const MAX_OBSERVATIONS = 20_000;

export type AttemptInput = {
  deps: ScanDeps;
  collector: Collector;
  product: Product;
  jobId: number;
  /** The scan the collector runs in; 0 for a run with no scan (a manual outside check). */
  scanId: number;
  /** How the collectors before this one ended in the scan. */
  statuses: Readonly<Record<string, CollectorStatus>>;
  /** The scan's (or job's) stop signal: cancel and worker shutdown. */
  signal: AbortSignal;
  event: (kind: EventKind, text: string) => void;
  /** The owner asked for this run by hand. */
  manual?: boolean;
  /** Called when a stop (not a timeout) cut the collector short. */
  onInterrupted?: () => void;
};

/**
 * Runs one collector the way every run must: with its own spend guard (a paid collector's budget
 * check and cost records, none for a free one), under its time limit and the stop signal, with its
 * result checked (a cost the ledger refused, too many observations). Throws when the collector
 * failed, was stopped or timed out. The scan and the manual outside check both go through here, so
 * no guard can exist in only one of them.
 */
export async function attemptCollector(input: AttemptInput): Promise<CollectorResult> {
  const { deps, collector, product, signal: parent } = input;
  const label = collectorLabel(collector.id);
  const timeoutMs = (deps.timeoutMs ?? collectorTimeoutMs)(collector.id);
  const spend = collector.paid
    ? makeSpend(deps.db, {
        ...deps.budget,
        now: deps.now,
        productId: product.id,
        collector: collector.id,
        jobId: input.jobId,
        log: (text) => input.event("error", `${label}: ${text}`),
      })
    : noSpend(collector.id);
  const run = runBounded(
    (signal) =>
      collector.collect(
        collectContext({
          deps,
          product,
          scanId: input.scanId,
          statuses: input.statuses,
          log: (text) => input.event("status", `${label}: ${text}`),
          signal,
          spend,
          manual: input.manual,
        }),
      ),
    timeoutMs,
    parent,
  );
  let returned = false;
  try {
    const result = await run.result;
    returned = true;
    // A cost the ledger refused is a pricing bug: fail visibly even if the collector caught it.
    const lost = spend.failure();
    if (lost) throw new Error(lost);
    const max = deps.maxObservations ?? MAX_OBSERVATIONS;
    if (result.status === "ok" && result.observations.length > max) {
      throw new Error(`Returned ${result.observations.length} observations (limit ${max})`);
    }
    return result;
  } catch (error) {
    if (!run.signal.aborted) throw error;
    if (parent.aborted && run.signal.reason === parent.reason) input.onInterrupted?.();
    // Prefer why we aborted (timeout, cancel) over the collector's own reaction to it.
    throw run.signal.reason;
  } finally {
    // A run that threw or was abandoned may have sent calls: their reservations stay counted.
    spend.release(returned ? "returned" : "threw");
  }
}
