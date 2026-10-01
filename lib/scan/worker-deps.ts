import { safeFetch } from "./fetch";
import { COLLECTORS, noScoring } from "./registry";
import type { ScanDeps } from "./run-scan";

type WorkerContext = Pick<ScanDeps, "db" | "config" | "products" | "now" | "stopping">;

/** The scan dependencies the worker runs with in production. */
export function workerScanDeps(context: WorkerContext): ScanDeps {
  return {
    ...context,
    collectors: COLLECTORS,
    fetch: safeFetch,
    scoreScan: noScoring, // replaced in Task 6
  };
}
