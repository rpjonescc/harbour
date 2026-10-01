import { COLLECTORS, noScoring, unavailableFetch } from "./registry";
import type { ScanDeps } from "./run-scan";

type WorkerContext = Pick<ScanDeps, "db" | "config" | "products" | "now" | "stopping">;

/** The scan dependencies the worker runs with in production. */
export function workerScanDeps(context: WorkerContext): ScanDeps {
  return {
    ...context,
    collectors: COLLECTORS,
    fetch: unavailableFetch, // replaced in Task 2
    scoreScan: noScoring, // replaced in Task 6
  };
}
