import { createSafeFetch } from "./fetch";
import { outboundHosts } from "./outbound-hosts";
import { COLLECTORS, noScoring } from "./registry";
import type { ScanDeps } from "./run-scan";

type WorkerContext = Pick<ScanDeps, "db" | "config" | "products" | "now" | "stopping">;

/** The scan dependencies the worker runs with in production. */
export function workerScanDeps(context: WorkerContext): ScanDeps {
  return {
    ...context,
    collectors: COLLECTORS,
    // One per scan: robots.txt is cached for the scan; the per-site limiter is process-wide.
    fetch: createSafeFetch({ allowedHosts: outboundHosts(context.products) }),
    scoreScan: noScoring, // replaced in Task 6
  };
}
