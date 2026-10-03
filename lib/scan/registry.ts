import { crawler } from "./collectors/crawler";
import { indexing } from "./collectors/indexing";
import { pagespeed } from "./collectors/pagespeed";
import { readiness } from "./collectors/readiness";
import { searchConsole } from "./collectors/search-console";
import type { Collector } from "./types";

const MINUTE = 60_000;

/**
 * Collectors a scan runs, in order: each after the collectors it `dependsOn` (readiness reads
 * the crawler's pages from the same scan).
 */
export const COLLECTORS: readonly Collector[] = [
  crawler,
  readiness,
  pagespeed,
  searchConsole,
  indexing,
];

/** How long a collector may run before it is aborted and recorded as failed. */
export function collectorTimeoutMs(id: string): number {
  // The crawler fetches hundreds of pages; indexing asks Google about up to 100, one a second.
  return id === "crawler" || id === "indexing" ? 10 * MINUTE : 2 * MINUTE;
}
