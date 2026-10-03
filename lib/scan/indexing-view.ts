import type { IndexState } from "./index-shapes";
import type { ScanObservation } from "./types";
import { type CoverageFacts, indexCoverageFacts } from "./view-shapes";
import type { CollectorRunView } from "./views";

/** Why the product page has no count to show. */
export type NoCoverage = "not_connected" | "no_sitemap" | "failed" | "waiting";

/** Google's index coverage in the scan behind the scores: a count, or why there is none. */
export type IndexingState =
  | {
      state: "counted";
      /** Pages Google has added, among those with a known status. */
      indexed: number;
      /** Pages with a known status. */
      checked: number;
      /** Pages in the sitemap. */
      total: number;
      byState: Record<IndexState, number>;
      checkedThrough: string | null;
    }
  | { state: "empty"; why: NoCoverage; reason: string | null };

const EMPTY_WHY: Record<string, NoCoverage> = {
  not_configured: "not_connected",
  skipped: "no_sitemap",
  failed: "failed",
};

function counted(facts: CoverageFacts): IndexingState {
  const { summary } = facts;
  return {
    state: "counted",
    indexed: summary.byState.indexed ?? 0,
    checked: summary.inspected,
    total: summary.total,
    byState: summary.byState,
    checkedThrough: summary.checkedThrough,
  };
}

/** The indexing check as the product page reads it; never a count when there is no data. */
export function indexingState(
  observations: readonly ScanObservation[],
  runs: readonly CollectorRunView[],
): IndexingState {
  const run = runs.find((r) => r.collector === "indexing");
  if (!run) return { state: "empty", why: "waiting", reason: null };
  if (run.status !== "ok") {
    return { state: "empty", why: EMPTY_WHY[run.status] ?? "waiting", reason: run.error };
  }
  const facts = indexCoverageFacts(observations);
  if (!facts) return { state: "empty", why: "waiting", reason: null };
  return counted(facts);
}
