import { INDEXING_REASONS } from "@/lib/explain/indexing";
import type { IndexState } from "./index-shapes";
import type { ScanObservation } from "./types";
import { type CoverageFacts, indexCoverageFacts } from "./view-shapes";
import type { CollectorRunView } from "./views";

/** Why the product page has no count to show. */
export type NoCoverage =
  | "not_connected"
  | "not_covered"
  | "crawler_failed"
  | "no_sitemap"
  | "failed"
  | "quota"
  | "no_answer"
  | "waiting";

/** Google's index coverage in the scan behind the scores: a count, or why there is none. */
export type IndexingState =
  | {
      state: "counted";
      /** Pages Google has added, among those with a known status. */
      indexed: number;
      /** Pages with a known status (at least one: otherwise the state is "empty"). */
      checked: number;
      /** Pages Google was asked about but could not answer for. */
      unknown: number;
      /** Pages in the sitemap that the property covers. */
      total: number;
      byState: Record<IndexState, number>;
      checkedThrough: string | null;
    }
  | { state: "empty"; why: NoCoverage; reason: string | null };

function notRun(status: string, reason: string | null): NoCoverage {
  if (status === "failed") return "failed";
  if (status === "not_configured") {
    return reason === INDEXING_REASONS.notCovered ? "not_covered" : "not_connected";
  }
  return reason === INDEXING_REASONS.crawlerFailed ? "crawler_failed" : "no_sitemap";
}

function counted(facts: CoverageFacts): IndexingState {
  const { summary } = facts;
  if (summary.inspected === 0) {
    // Never a count of zero: say why nothing is known yet.
    return {
      state: "empty",
      why: summary.stoppedBy === "quota" ? "quota" : "no_answer",
      reason: null,
    };
  }
  return {
    state: "counted",
    indexed: summary.byState.indexed ?? 0,
    checked: summary.inspected,
    unknown: summary.byState.unknown ?? 0,
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
    return { state: "empty", why: notRun(run.status, run.error), reason: run.error };
  }
  const facts = indexCoverageFacts(observations);
  if (!facts) return { state: "empty", why: "waiting", reason: null };
  return counted(facts);
}
