import { crawler } from "./collectors/crawler";
import { indexing } from "./collectors/indexing";
import { pagespeed } from "./collectors/pagespeed";
import { readiness } from "./collectors/readiness";
import { searchConsole } from "./collectors/search-console";
import { treg } from "./collectors/treg";
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
  treg,
];

const LONG_RUNNING = ["crawler", "indexing", "treg"];

/** How long a collector may run before it is aborted and recorded as failed. */
export function collectorTimeoutMs(id: string): number {
  // The crawler fetches hundreds of pages; indexing asks Google about up to 100, one a second;
  // the Treg checks wait up to 30 s each for an AI answer.
  return LONG_RUNNING.includes(id) ? 10 * MINUTE : 2 * MINUTE;
}
