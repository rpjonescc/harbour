import { z } from "zod";
import { parseJson } from "./google-api";

/** Clicks, impressions, CTR (0–1) and average position for one date, query or page. */
export type GscMetrics = { clicks: number; impressions: number; ctr: number; position: number };

/** One Search Analytics report the collector asks for, and the observation kind it becomes. */
export type GscReport = { kind: string; dimension: "date" | "query" | "page"; rowLimit: number };

const DAYS = 28;

/** Daily totals for the whole window, then the top queries and pages (by clicks). */
export const GSC_REPORTS: readonly GscReport[] = [
  { kind: "gsc_daily", dimension: "date", rowLimit: DAYS },
  { kind: "gsc_query", dimension: "query", rowLimit: 250 },
  { kind: "gsc_page", dimension: "page", rowLimit: 100 },
];

/** Search Console's final data lags 2–3 days: end the window 3 days back, before it thins out. */
const LAG_DAYS = 3;
const DAY_MS = 24 * 60 * 60_000;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** The 28 days (inclusive, UTC dates) a scan at `now` reports on. */
export function reportWindow(now: Date): { startDate: string; endDate: string } {
  const end = now.getTime() - LAG_DAYS * DAY_MS;
  return {
    startDate: isoDate(new Date(end - (DAYS - 1) * DAY_MS)),
    endDate: isoDate(new Date(end)),
  };
}

/** searchAnalytics.query for a property (`sc-domain:…` or a URL prefix), encoded for the path. */
export function reportUrl(property: string): string {
  const site = encodeURIComponent(property);
  return `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`;
}

/** The request body for one report over `window`. */
export function reportRequest(report: GscReport, window: ReturnType<typeof reportWindow>) {
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
