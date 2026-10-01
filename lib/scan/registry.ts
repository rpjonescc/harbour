import { crawler } from "./collectors/crawler";
import { pagespeed } from "./collectors/pagespeed";
import { readiness } from "./collectors/readiness";
import { searchConsole } from "./collectors/search-console";
import type { Collector, ScoreScan } from "./types";

const MINUTE = 60_000;

/**
 * Collectors a scan runs, in order: each after the collectors it `dependsOn` (readiness reads
 * the crawler's pages from the same scan).
 */
export const COLLECTORS: readonly Collector[] = [crawler, readiness, pagespeed, searchConsole];

/** How long a collector may run before it is aborted and recorded as failed. */
export function collectorTimeoutMs(id: string): number {
  return id === "crawler" ? 10 * MINUTE : 2 * MINUTE;
}

/** Scoring until the v1 formula lands (replaced in Task 6): no score row is written. */
export const noScoring: ScoreScan = () => null;
