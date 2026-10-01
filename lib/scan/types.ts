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
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  ms: number;
};

/** Outbound HTTP for collectors: timeouts, redirect and size limits, robots, politeness. */
export type SafeFetch = (
  url: string,
  options: { maxBytes: number; accept?: string; signal?: AbortSignal },
) => Promise<SafeFetchResponse>;

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
};

export type Collector = {
  /** "crawler" | "readiness" | "pagespeed" | "search-console" */
  id: string;
  cadence: "daily" | "weekly";
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
