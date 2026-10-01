import { type RuleActionStatus, ruleActionStatuses } from "@/lib/actions/views";
import type { Db } from "@/lib/db/client";
import { deriveIssues, type Issue } from "./issues";
import { type PageRow, pageRows } from "./page-rows";
import { type SearchSummary, searchSummary } from "./search-summary";
import { scanObservations } from "./store";
import type { CollectorStatus, ScanObservation } from "./types";
import {
  type CollectorRunView,
  productScoreTrend,
  type ScanState,
  type ScoreTrend,
  scanCollectorRuns,
  scanState,
} from "./views";

/** Search Console in the scan behind the scores: its data, or why there is none. */
export type SearchState =
  | { state: "ok"; summary: SearchSummary | null }
  | { state: Exclude<CollectorStatus, "ok"> | "none"; reason: string | null };

/** Everything the product page shows. */
export type ProductView = {
  scores: ScoreTrend;
  scan: ScanState;
  issues: Issue[];
  /** Each issue's action by rule id; an issue without one is not tracked yet. */
  actionByRule: Map<string, RuleActionStatus>;
  pages: { rows: PageRow[]; total: number };
  search: SearchState;
};

/** What a scan found: its observations, how each collector ended, and those endings by collector. */
export function scanFindings(
  db: Db,
  scanId: number | undefined,
): {
  observations: ScanObservation[];
  runs: CollectorRunView[];
  statuses: Record<string, CollectorStatus>;
} {
  if (scanId === undefined) return { observations: [], runs: [], statuses: {} };
  const runs = scanCollectorRuns(db, scanId);
  return {
    observations: scanObservations(db, scanId),
    runs,
    statuses: Object.fromEntries(runs.map((run) => [run.collector, run.status])),
  };
}

function searchState(observations: ScanObservation[], runs: CollectorRunView[]): SearchState {
  const run = runs.find((r) => r.collector === "search-console");
  if (!run) return { state: "none", reason: null };
  if (run.status === "ok") return { state: "ok", summary: searchSummary(observations) };
  return { state: run.status, reason: run.error };
}

/** The product page's data, all from the scan behind the latest scores. */
export function productView(db: Db, productId: string, now: Date): ProductView {
  const scores = productScoreTrend(db, productId, now);
  const { observations, runs, statuses } = scanFindings(db, scores.latest?.scanId);
  return {
    scores,
    scan: scanState(db, productId),
    issues: deriveIssues(observations, statuses),
    actionByRule: ruleActionStatuses(db, productId),
    pages: pageRows(observations),
    search: searchState(observations, runs),
  };
}
