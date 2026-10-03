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

/** A host as URLs spell it (punycode, lower case) without one trailing dot; "" if unparsable. */
function normaliseHost(host: string): string {
  const parsed = host.trim() === "" ? null : URL.parse(`http://${host}`);
  return parsed ? parsed.hostname.replace(/\.$/, "") : "";
}

/**
 * The pages a Search Console property covers. `sc-domain:d` covers `d` and its subdomains (any
 * scheme); a URL-prefix property covers pages on the same origin whose path starts with its path.
 * Anything else, including a lookalike host such as `evilexample.com`, is out of scope.
 */
export function pagesInScope(urls: readonly string[], property: string): string[] {
  const domain = property.startsWith("sc-domain:")
    ? normaliseHost(property.slice("sc-domain:".length))
    : null;
  const prefix = domain === null ? URL.parse(property) : null;
  return urls.filter((url) => {
    const page = URL.parse(url);
    if (!page) return false;
    if (domain !== null) {
      // An empty or unparsable domain ("" after normalising) matches nothing.
      const host = normaliseHost(page.hostname);
      return domain !== "" && (host === domain || host.endsWith(`.${domain}`));
    }
    return (
      prefix !== null && page.origin === prefix.origin && page.pathname.startsWith(prefix.pathname)
    );
  });
}

/** A page that failed this many checks in a row is retried behind every other page. */
const ROTATE_AFTER_FAILURES = 2;

/** 0 never asked, 1 failed once (retry first), 2 healthy, 3 failing repeatedly (last). */
function tier(status: IndexStatus | undefined): number {
  if (!status) return 0;
  const failures = status.failures ?? 0;
  if (failures === 0) return 2;
  return failures < ROTATE_AFTER_FAILURES ? 1 : 3;
}

/**
 * Which pages to ask about now, at most `limit`. Order: never-asked pages (sitemap order); pages
 * whose last check failed once, so a transient failure is retried before routine refreshes; then
 * the oldest good check first; pages that keep failing go last so a handful of them cannot use
 * up the run's failure allowance every day and stall the rotation. A page that already failed
 * today is left out: one retry per page per day, however often a check is started.
 */
export function chooseUrls(
  urls: readonly string[],
  known: ReadonlyMap<string, IndexStatus>,
  now: Date,
  limit = MAX_PER_RUN,
): string[] {
  const today = now.toISOString().slice(0, 10);
  const key = (url: string) => {
    const status = known.get(url);
    const at = tier(status) % 2 === 1 ? status?.attemptedAt : status?.checkedAt;
    return at === undefined ? Number.NEGATIVE_INFINITY : Date.parse(at);
  };
  const due = urls.filter((url) => known.get(url)?.attemptedAt?.slice(0, 10) !== today);
  // Array.prototype.sort is stable, so ties keep the sitemap's order.
  return due
    .sort((a, b) => tier(known.get(a)) - tier(known.get(b)) || key(a) - key(b))
    .slice(0, limit);
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
