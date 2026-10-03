import type { CollectContext, Collector, CollectorResult, Observation } from "../types";
import { gscAccess } from "./gsc-access";
import { type AccessTokenSource, googleAccessToken } from "./gsc-token";
import { inspectUrl } from "./index-inspect";
import {
  chooseUrls,
  earlierSeenSince,
  knownStatuses,
  type StoppedBy,
  sitemapPageUrls,
  summarise,
} from "./index-plan";
import { type IndexStatus, unknownStatus } from "./index-state";

/** One request at a time, each at least this far after the last one started: under 1 a second. */
const SPACING_MS = 1_100;
/** The run ends here (the worker's own limit for this collector is longer). */
const MAX_RUN_MS = 8 * 60_000;
/** Pages in a row that could not be checked before the run stops asking. */
const MAX_FAILURES_IN_A_ROW = 5;

const NOT_RUN_CRAWLER = "The crawler did not run ok, so there are no sitemap pages to check";
const NO_SITEMAP = "No sitemap pages were recorded, so there is nothing to check";
// Fixed sentences: nothing from Google's answers goes into a log line.
const STOPPED_LOG: Record<Exclude<StoppedBy, null>, string> = {
  quota:
    "Search Console's daily limit for page checks is used up: the rest waits for tomorrow's check",
  time: "Stopped after the time allowed for one run: the rest waits for the next check",
  errors:
    "Stopped after several pages in a row could not be checked: the rest waits for the next check",
};

export type IndexingDeps = {
  accessToken: AccessTokenSource;
  /** Pauses between requests; rejects when `signal` aborts. Tests swap in an instant one. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Milliseconds now, for pacing and the run's own time limit. */
  clock: () => number;
};

function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

type Run = {
  statuses: Map<string, IndexStatus>;
  checked: number;
  stoppedBy: StoppedBy;
};

/** Inspects `chosen` one by one, updating `run.statuses`; stops on quota, time or repeated failure. */
async function inspectAll(
  deps: IndexingDeps,
  ctx: CollectContext,
  access: Parameters<typeof inspectUrl>[1],
  chosen: readonly string[],
  run: Run,
): Promise<void> {
  const started = deps.clock();
  let lastStart = Number.NEGATIVE_INFINITY;
  let failures = 0;
  // Bounded: at most MAX_PER_RUN pages, each once.
  for (const url of chosen) {
    ctx.signal.throwIfAborted();
    const wait = lastStart + SPACING_MS - deps.clock();
    if (wait > 0) await deps.sleep(wait, ctx.signal);
    if (deps.clock() - started > MAX_RUN_MS) {
      run.stoppedBy = "time";
      return;
    }
    lastStart = deps.clock();
    const checkedAt = ctx.now.toISOString();
    const result = await inspectUrl(ctx, access, url, checkedAt);
    run.checked++;
    if (result.outcome === "quota") {
      run.stoppedBy = "quota";
      return;
    }
    if (result.outcome === "checked") {
      run.statuses.set(url, result.status);
      failures = 0;
      continue;
    }
    // A page that failed keeps its earlier status (and its old check time, so it is retried
    // first next run); one never checked is recorded as unknown, not guessed.
    if (!run.statuses.has(url)) run.statuses.set(url, unknownStatus(checkedAt));
    if (++failures >= MAX_FAILURES_IN_A_ROW) {
      run.stoppedBy = "errors";
      return;
    }
  }
}

async function collectWith(deps: IndexingDeps, ctx: CollectContext): Promise<CollectorResult> {
  if (ctx.earlier.status("crawler") !== "ok") return { status: "skipped", reason: NOT_RUN_CRAWLER };
  const urls = sitemapPageUrls(ctx.earlier.observations("crawler"));
  if (urls.length === 0) return { status: "skipped", reason: NO_SITEMAP };
  const found = await gscAccess(ctx, deps.accessToken);
  if ("notConfigured" in found) return found.notConfigured;

  const previous = ctx.previous.observations("indexing");
  const known = knownStatuses(previous);
  const run: Run = { statuses: new Map(), checked: 0, stoppedBy: null };
  for (const url of urls) {
    const status = known.get(url);
    if (status) run.statuses.set(url, status);
  }
  const chosen = chooseUrls(urls, known);
  await inspectAll(deps, ctx, found.access, chosen, run);

  const summary = summarise({
    urls,
    statuses: run.statuses,
    checkedThisRun: run.checked,
    stoppedBy: run.stoppedBy,
    sitemapSeenSince: earlierSeenSince(previous) ?? ctx.now.toISOString(),
  });
  if (run.stoppedBy) ctx.log(STOPPED_LOG[run.stoppedBy]);
  ctx.log(
    `Asked Google about ${run.checked} pages: ${summary.inspected} of ${summary.total} now have a known status`,
  );
  const observations: Observation[] = urls.flatMap((url) => {
    const value = run.statuses.get(url);
    return value ? [{ kind: "index_status", subject: url, value }] : [];
  });
  observations.push({ kind: "index_summary", subject: found.access.property, value: summary });
  return { status: "ok", observations };
}

/** Builds the collector around its token source, pause and clock (tests inject fakes). */
export function createIndexing(deps: IndexingDeps): Collector {
  return {
    id: "indexing",
    cadence: "daily",
    paid: false,
    dependsOn: ["crawler", "search-console"],
    collect: (ctx) => collectWith(deps, ctx),
  };
}

/** Google's index coverage: which of the sitemap's pages Google has added, 100 a day at most. */
export const indexing: Collector = createIndexing({
  accessToken: googleAccessToken,
  sleep: pause,
  clock: Date.now,
});
