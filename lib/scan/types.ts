import type { Config } from "@/lib/config";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";

/** One raw fact a collector saw, e.g. a crawled page or a Search Console day. */
export type Observation = { kind: string; subject: string; value: Record<string, unknown> };

export type CollectorResult =
  | { status: "ok"; observations: Observation[] }
  | { status: "not_configured"; reason: string }
  | { status: "skipped"; reason: string };

export type CollectorStatus = CollectorResult["status"] | "failed";

/** A bounded HTTP response; produced by the safe fetch (constraints in the Phase 3 plan). */
export type SafeFetchResponse = {
  url: string;
  finalUrl: string;
  /** Each URL that answered with a redirect, in order (empty when there was none). */
  redirects: string[];
  status: number;
  /** Lowercased names; a repeated header's values joined with ", ". */
  headers: Record<string, string>;
  /** Every header line as received (lowercased names), so repeated headers stay apart. */
  headerLines: [string, string][];
  body: string;
  truncated: boolean;
  ms: number;
};

export type SafeFetchOptions = {
  /** Body cap in bytes. */
  maxBytes: number;
  /**
   * Over the cap: "truncate" (default) returns the first `maxBytes` with `truncated: true`;
   * "error" throws FetchError "too_large", whether the size was declared or streamed.
   */
  onOverflow?: "truncate" | "error";
  accept?: string;
  signal?: AbortSignal;
  /**
   * Every hop is refused (FetchError "blocked_by_robots") when robots.txt disallows it for
   * HarbourBot. Only API calls that aren't crawling a site (Google APIs) opt out.
   */
  ignoreRobots?: true;
  /**
   * Overrides the 15 s per-request timeout, honoured only for Google API hosts: PageSpeed
   * Insights runs Lighthouse before answering, which takes 15–40 s. Ignored for other hosts.
   */
  timeoutMs?: number;
};

/** Outbound HTTP for collectors: timeouts, redirect and size limits, robots, politeness. */
export type SafeFetch = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResponse>;

/** What collectors that already ran in this scan ended with; read-only. */
export type EarlierResults = {
  /** How the collector ended in this scan; undefined when it has not run (yet). */
  status(collector: string): CollectorStatus | undefined;
  /** What the collector stored in this scan: empty unless it ended ok. */
  observations(collector: string): Observation[];
};

export type CollectContext = {
  /** From harbour.config.json. */
  product: Product;
  config: Config;
  now: Date;
  fetch: SafeFetch;
  /** Becomes a job event. */
  log: (message: string) => void;
  /** Aborted on timeout, job cancel or worker shutdown. */
  signal: AbortSignal;
  /** Results of the collectors that ran before this one in the same scan. */
  earlier: EarlierResults;
};

export type Collector = {
  /** "crawler" | "readiness" | "pagespeed" | "search-console" */
  id: string;
  cadence: "daily" | "weekly";
  /** Collectors whose results this one reads through `ctx.earlier`: they must run before it. */
  dependsOn?: readonly string[];
  /** Throwing means the collector failed. */
  collect(ctx: CollectContext): Promise<CollectorResult>;
};

/** A stored observation with the collector that produced it, as scoring reads it. */
export type ScanObservation = Observation & { collector: string };

export type ScanScores = {
  formulaVersion: string;
  seo: number | null;
  geo: number | null;
  aeo: number | null;
  complete: { seo: boolean; geo: boolean; aeo: boolean };
  breakdown: ScoreBreakdownEntry[];
};

/** Pure scoring of one scan; null when there is no formula to apply yet. */
export type ScoreScan = (
  observations: readonly ScanObservation[],
  statuses: Readonly<Record<string, CollectorStatus>>,
) => ScanScores | null;
