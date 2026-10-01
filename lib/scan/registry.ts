import { crawler } from "./collectors/crawler";
import { pagespeed } from "./collectors/pagespeed";
import { readiness } from "./collectors/readiness";
import type { Collector, ScoreScan } from "./types";

const MINUTE = 60_000;

/**
 * Collectors a scan runs, in order: each after the collectors it `dependsOn` (readiness reads
 * the crawler's pages from the same scan).
 */
export const COLLECTORS: readonly Collector[] = [crawler, readiness, pagespeed];

const LABELS: Record<string, string> = {
  crawler: "Crawler",
  readiness: "Readiness",
  pagespeed: "PageSpeed",
  "search-console": "Search Console",
};

/** Owner-facing name of a collector, e.g. "Search Console". */
export function collectorLabel(id: string): string {
  return LABELS[id] ?? id;
}

/** How long a collector may run before it is aborted and recorded as failed. */
export function collectorTimeoutMs(id: string): number {
  return id === "crawler" ? 10 * MINUTE : 2 * MINUTE;
}

/** Scoring until the v1 formula lands (replaced in Task 6): no score row is written. */
export const noScoring: ScoreScan = () => null;
