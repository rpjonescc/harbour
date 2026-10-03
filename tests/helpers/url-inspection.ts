import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIndexing } from "@/lib/scan/collectors/indexing";
import { FetchError } from "@/lib/scan/fetch-error";
import type { CollectContext, Observation, SafeFetch, SafeFetchOptions } from "@/lib/scan/types";
import { crawlContext } from "./crawl";
import { AUTHORIZED_USER } from "./gsc";

export const PROPERTY = "sc-domain:docs.example.com";
export const TOKEN = "test-access-token-xyz";
export const ORIGIN = "https://docs.example.com";

/** A synthetic URL Inspection answer, shaped like Google's (fictional page data). */
export function inspection(result: Record<string, unknown>): string {
  return JSON.stringify({ inspectionResult: { indexStatusResult: result } });
}

const INDEXED = {
  verdict: "PASS",
  coverageState: "Submitted and indexed",
  robotsTxtState: "ALLOWED",
  indexingState: "INDEXING_ALLOWED",
  pageFetchState: "SUCCESSFUL",
  lastCrawlTime: "2026-09-28T04:10:00Z",
  googleCanonical: `${ORIGIN}/a`,
};

/** Recorded-style answers for each state Harbour maps. */
export const ANSWERS = {
  indexed: inspection(INDEXED),
  discovered: inspection({
    verdict: "NEUTRAL",
    coverageState: "Discovered - currently not indexed",
    robotsTxtState: "ALLOWED",
    indexingState: "INDEXING_ALLOWED",
    pageFetchState: "SUCCESSFUL",
  }),
  crawled: inspection({
    verdict: "NEUTRAL",
    coverageState: "Crawled - currently not indexed",
    robotsTxtState: "ALLOWED",
    pageFetchState: "SUCCESSFUL",
    lastCrawlTime: "2026-09-29T01:00:00Z",
  }),
  unknown: inspection({
    verdict: "NEUTRAL",
    coverageState: "URL is unknown to Google",
    robotsTxtState: "ALLOWED",
  }),
  blocked: inspection({
    verdict: "NEUTRAL",
    coverageState: "Blocked by robots.txt",
    robotsTxtState: "DISALLOWED",
  }),
  other: inspection({ verdict: "NEUTRAL", coverageState: "Page with redirect" }),
} as const;

export const googleError = (code: number, message: string, reason?: string) =>
  JSON.stringify({
    error: { code, message, errors: reason ? [{ reason }] : [], status: "ERR" },
  });

export type Answer = { status?: number; body: string } | "hang" | "error";
export type Call = { url: string; options: SafeFetchOptions; inspected: string };

/** A fake URL Inspection endpoint: `answer(url, n)` says what the nth request gets. */
export function inspectionApi(answer: (url: string, n: number) => Answer) {
  const calls: Call[] = [];
  const fetch: SafeFetch = async (url, options) => {
    const json = options.post?.json as { inspectionUrl: string };
    calls.push({ url, options, inspected: json.inspectionUrl });
    const given = answer(json.inspectionUrl, calls.length);
    if (given === "hang") throw new FetchError("timeout", "took too long");
    if (given === "error") throw new FetchError("network", "connection reset");
    const base = { url, finalUrl: url, redirects: [], headers: {}, headerLines: [] };
    return { ...base, status: given.status ?? 200, body: given.body, truncated: false, ms: 5 };
  };
  return { fetch, calls };
}

let dir: string | null = null;
/** Removes the temporary credentials file the last `indexingRun` wrote. */
export function cleanCredentials() {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
}

export const page = (n: number | string) => `${ORIGIN}/p${n}`;
export const pages = (count: number) => Array.from({ length: count }, (_, i) => page(i + 1));

export const sitemapObservation = (urls: string[]): Observation => ({
  kind: "sitemap_urls",
  subject: `${ORIGIN}/`,
  value: { urls },
});

export type RunSetup = {
  urls?: string[];
  fetch?: SafeFetch;
  previous?: Observation[];
  now?: Date;
  crawler?: "ok" | "failed";
  credentials?: boolean;
  property?: string | null;
  signal?: AbortSignal;
  clock?: () => number;
};

/** Runs the indexing collector with a fake token, an instant pause and a stepping clock. */
export async function indexingRun(setup: RunSetup = {}) {
  const log: string[] = [];
  const urls = setup.urls ?? pages(3);
  const base = crawlContext(ORIGIN, { fetch: setup.fetch, log: (m) => log.push(m) });
  let path: string | undefined;
  if (setup.credentials !== false) {
    dir = mkdtempSync(join(tmpdir(), "harbour-idx-"));
    path = join(dir, "gsc.json");
    writeFileSync(path, JSON.stringify(AUTHORIZED_USER));
    chmodSync(path, 0o600);
  }
  const crawlerStatus = setup.crawler ?? "ok";
  const ctx: CollectContext = {
    ...base,
    now: setup.now ?? new Date("2026-10-02T06:00:00Z"),
    signal: setup.signal ?? base.signal,
    config: { ...base.config, HARBOUR_GSC_CREDENTIALS: path },
    product: {
      ...base.product,
      searchConsoleProperty: setup.property === null ? undefined : (setup.property ?? PROPERTY),
    },
    earlier: {
      status: (id) => (id === "crawler" ? crawlerStatus : undefined),
      observations: (id) => (id === "crawler" ? [sitemapObservation(urls)] : []),
    },
    previous: { observations: (id) => (id === "indexing" ? (setup.previous ?? []) : []) },
  };
  let t = 0;
  const collector = createIndexing({
    accessToken: async () => TOKEN,
    sleep: async () => {},
    clock: setup.clock ?? (() => (t += 10)),
  });
  const result = await collector.collect(ctx);
  return { result, log };
}

/** The result's observations of one kind; throws unless the run was ok. */
export function observed(result: Awaited<ReturnType<typeof indexingRun>>["result"], kind: string) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result.observations.filter((o) => o.kind === kind);
}
