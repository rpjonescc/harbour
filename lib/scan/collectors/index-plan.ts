import { z } from "zod";
import {
  INDEX_STATES,
  type IndexState,
  type IndexStatus,
  type IndexSummary,
  indexStatusValue,
  indexSummaryValue,
  type StoppedBy,
} from "../index-shapes";
import type { Observation } from "../types";

// Which pages to inspect next and what a run reports: the carry-over that lets a site larger than
// one run's budget be covered a part at a time, oldest check first.

/** Most pages inspected per product per run (the API allows about 2,000 a day). */
export const MAX_PER_RUN = 100;
/** The crawl limit's ceiling: no sitemap list is considered longer than this. */
const MAX_URLS = 500;
const MAX_URL = 2_000;

const sitemapUrls = z.object({ urls: z.array(z.string()) });
const isHttp = (value: string) => /^https?:$/.test(URL.parse(value)?.protocol ?? "");

/** The sitemap's page URLs in the crawler's observations: well-formed, unique, capped. */
export function sitemapPageUrls(observations: readonly Observation[]): string[] {
  const listed = observations.find((o) => o.kind === "sitemap_urls");
  const parsed = sitemapUrls.safeParse(listed?.value);
  if (!parsed.success) return [];
  const valid = parsed.data.urls.filter((u) => u.length <= MAX_URL && isHttp(u));
  return [...new Set(valid)].slice(0, MAX_URLS);
}

/** The latest known status per URL from an earlier run; anything malformed is left out. */
export function knownStatuses(previous: readonly Observation[]): Map<string, IndexStatus> {
  const known = new Map<string, IndexStatus>();
  for (const o of previous) {
    if (o.kind !== "index_status") continue;
    const parsed = indexStatusValue.safeParse(o.value);
    if (parsed.success && isHttp(o.subject)) known.set(o.subject, parsed.data);
  }
  return known;
}

/** When the earlier run first saw the sitemap, or null if it never reported. */
export function earlierSeenSince(previous: readonly Observation[]): string | null {
  const found = previous.find((o) => o.kind === "index_summary");
  const parsed = indexSummaryValue.safeParse(found?.value);
  return parsed.success ? parsed.data.sitemapSeenSince : null;
}

/** Never-checked pages first (in sitemap order), then the oldest check; at most `limit`. */
export function chooseUrls(
  urls: readonly string[],
  known: ReadonlyMap<string, IndexStatus>,
  limit = MAX_PER_RUN,
): string[] {
  const checkedAt = (url: string) => {
    const at = known.get(url)?.checkedAt;
    return at === undefined ? Number.NEGATIVE_INFINITY : Date.parse(at);
  };
  // Array.prototype.sort is stable, so ties keep the sitemap's order.
  return [...urls].sort((a, b) => checkedAt(a) - checkedAt(b)).slice(0, limit);
}

/** The run's report over the pages that now have a status. */
export function summarise(input: {
  urls: readonly string[];
  statuses: ReadonlyMap<string, IndexStatus>;
  checkedThisRun: number;
  stoppedBy: StoppedBy;
  sitemapSeenSince: string;
}): IndexSummary {
  const byState = Object.fromEntries(INDEX_STATES.map((s) => [s, 0])) as Record<IndexState, number>;
  let inspected = 0;
  let oldest: number | null = null;
  for (const url of input.urls) {
    const status = input.statuses.get(url);
    if (!status) continue;
    byState[status.state]++;
    if (status.state === "unknown") continue;
    inspected++;
    const at = Date.parse(status.checkedAt);
    oldest = oldest === null ? at : Math.min(oldest, at);
  }
  return {
    inspected,
    total: input.urls.length,
    byState,
    checkedThrough: oldest === null ? null : new Date(oldest).toISOString(),
    checkedThisRun: input.checkedThisRun,
    stoppedBy: input.stoppedBy,
    sitemapSeenSince: input.sitemapSeenSince,
  };
}
