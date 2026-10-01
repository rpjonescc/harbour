import type { Product } from "@/lib/products/catalog";
import type { ScanDeps } from "./run-scan";
import { collectorObservations } from "./store";
import type { CollectContext, CollectorStatus } from "./types";

export type CollectContextInput = {
  deps: Pick<ScanDeps, "db" | "config" | "now" | "fetch">;
  product: Product;
  scanId: number;
  /** How each collector that ran before this one ended in this scan. */
  statuses: Readonly<Record<string, CollectorStatus>>;
  log: (text: string) => void;
  signal: AbortSignal;
};

/** What one collector sees while it runs in a scan. */
export function collectContext(input: CollectContextInput): CollectContext {
  const { deps, product, scanId, statuses, log, signal } = input;
  return {
    product,
    config: deps.config,
    now: deps.now(),
    fetch: deps.fetch,
    log,
    signal,
    earlier: {
      status: (id) => statuses[id],
      observations: (id) => collectorObservations(deps.db, scanId, id),
    },
  };
}
