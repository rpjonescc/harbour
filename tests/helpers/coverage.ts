import type { IndexState } from "@/lib/scan/index-shapes";
import type { ScanObservation } from "@/lib/scan/types";

const DAY = 24 * 60 * 60_000;
export const CHECKED_AT = "2026-10-20T06:00:00.000Z";
/** Known 19 days before the check: past the rule's 14-day gate. */
export const OLD_SITEMAP = new Date(Date.parse(CHECKED_AT) - 19 * DAY).toISOString();
export const NEW_SITEMAP = new Date(Date.parse(CHECKED_AT) - 3 * DAY).toISOString();

const ZERO: Record<IndexState, number> = {
  indexed: 0,
  discovered_not_indexed: 0,
  crawled_not_indexed: 0,
  unknown_to_google: 0,
  blocked: 0,
  other: 0,
  unknown: 0,
};

/** An `index_status` observation for /p<n> on a fictional site. */
export function indexStatus(n: number, state: IndexState, checkedAt = CHECKED_AT): ScanObservation {
  const known = state !== "unknown";
  return {
    collector: "indexing",
    kind: "index_status",
    subject: `https://docs.example.com/p${n}`,
    value: {
      state,
      verdict: known ? "NEUTRAL" : null,
      coverageState: known ? "Discovered - currently not indexed" : null,
      lastCrawlTime: null,
      googleCanonical: null,
      robotsTxtState: null,
      pageFetchState: null,
      checkedAt,
    },
  };
}

/** The statuses for `states` (page 1 first) and the run's summary over them. */
export function coverage(
  states: IndexState[],
  { total = states.length, seen = OLD_SITEMAP }: { total?: number; seen?: string } = {},
): ScanObservation[] {
  const byState = { ...ZERO };
  for (const s of states) byState[s]++;
  const summary: ScanObservation = {
    collector: "indexing",
    kind: "index_summary",
    subject: "sc-domain:docs.example.com",
    value: {
      inspected: states.filter((s) => s !== "unknown").length,
      total,
      byState,
      checkedThrough: CHECKED_AT,
      checkedThisRun: states.length,
      stoppedBy: null,
      sitemapSeenSince: seen,
    },
  };
  return [...states.map((s, i) => indexStatus(i + 1, s)), summary];
}

/** `count` copies of `state`. */
export const times = (count: number, state: IndexState): IndexState[] =>
  Array.from({ length: count }, () => state);
