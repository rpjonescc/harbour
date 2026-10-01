import { z } from "zod";
import { parseJson } from "./google-api";

/** Clicks, impressions, CTR (0–1) and average position for one date, query or page. */
export type GscMetrics = { clicks: number; impressions: number; ctr: number; position: number };

/**
 * One Search Analytics report the collector asks for, the observation kind it becomes, and
 * whether it covers the scan's window or the 28 days before it.
 */
export type GscReport = {
  kind: string;
  dimension: "date" | "query" | "page";
  rowLimit: number;
  period: "current" | "prior";
};

/** Inclusive UTC dates, as Search Analytics takes them. */
export type ReportWindow = { startDate: string; endDate: string };

const DAYS = 28;

/**
 * Daily totals for the whole window, the top queries and pages (by clicks), then daily totals
 * for the 28 days before, so scoring can compare the two windows' impressions.
 */
export const GSC_REPORTS: readonly GscReport[] = [
  { kind: "gsc_daily", dimension: "date", rowLimit: DAYS, period: "current" },
  { kind: "gsc_query", dimension: "query", rowLimit: 250, period: "current" },
  { kind: "gsc_page", dimension: "page", rowLimit: 100, period: "current" },
  { kind: "gsc_prior_daily", dimension: "date", rowLimit: DAYS, period: "prior" },
];

/** Search Console's final data lags 2–3 days: end the window 3 days back, before it thins out. */
const LAG_DAYS = 3;
const DAY_MS = 24 * 60 * 60_000;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function windowEnding(end: number): ReportWindow {
  return {
    startDate: isoDate(new Date(end - (DAYS - 1) * DAY_MS)),
    endDate: isoDate(new Date(end)),
  };
}

/** The 28 days a scan at `now` reports on, and the 28 days before them. */
export function reportWindows(now: Date): Record<GscReport["period"], ReportWindow> {
  const end = now.getTime() - LAG_DAYS * DAY_MS;
  return { current: windowEnding(end), prior: windowEnding(end - DAYS * DAY_MS) };
}

/** searchAnalytics.query for a property (`sc-domain:…` or a URL prefix), encoded for the path. */
export function reportUrl(property: string): string {
  const site = encodeURIComponent(property);
  return `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`;
}

/** The request body for one report over `window`. */
export function reportRequest(report: GscReport, window: ReportWindow) {
  return { ...window, dimensions: [report.dimension], rowLimit: report.rowLimit, type: "web" };
}

const row = z.object({
  keys: z.tuple([z.string().min(1)]),
  clicks: z.number().nonnegative(),
  impressions: z.number().nonnegative(),
  ctr: z.number().min(0).max(1),
  position: z.number().nonnegative(),
});

// No `rows` means no data for the window: an empty report, not an error.
const response = z.object({ rows: z.array(row).default([]) });

/** The report's rows as [key, metrics]; throws a readable Error on an unexpected body. */
export function readReport(body: string): [string, GscMetrics][] {
  const parsed = response.safeParse(parseJson(body));
  if (!parsed.success) throw new Error("Search Console returned an unexpected response");
  return parsed.data.rows.map(({ keys, clicks, impressions, ctr, position }) => [
    keys[0],
    { clicks, impressions, ctr, position },
  ]);
}
