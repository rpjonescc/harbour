import type { ScanObservation } from "./types";
import { gscRows, gscWindow } from "./view-shapes";

export type SearchDay = { date: string; clicks: number; impressions: number };
export type SearchQuery = { query: string; clicks: number; impressions: number; position: number };

/** What the Search Console panel shows for one scan. */
export type SearchSummary = {
  startDate: string;
  endDate: string;
  days: SearchDay[];
  clicks: number;
  impressions: number;
  topQueries: SearchQuery[];
};

const TOP_QUERIES = 10;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** The scan's Search Console window: daily series, totals and top queries; null without one. */
export function searchSummary(observations: readonly ScanObservation[]): SearchSummary | null {
  const window = gscWindow(observations);
  if (!window) return null;
  const days = gscRows(observations, "gsc_daily")
    .map(({ key, clicks, impressions }) => ({ date: key, clicks, impressions }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const topQueries = gscRows(observations, "gsc_query")
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, TOP_QUERIES)
    .map(({ key, clicks, impressions, position }) => ({
      query: key,
      clicks,
      impressions,
      position,
    }));
  return {
    ...window,
    days,
    clicks: sum(days.map((d) => d.clicks)),
    impressions: sum(days.map((d) => d.impressions)),
    topQueries,
  };
}
