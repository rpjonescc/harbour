import { searchSummary } from "./search-summary";
import type { ScanObservation } from "./types";

const gsc = (
  kind: string,
  subject: string,
  clicks: number,
  impressions: number,
): ScanObservation => ({
  collector: "search-console",
  kind,
  subject,
  value: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 7.25 },
});

describe("searchSummary", () => {
  it("is null without Search Console data", () => {
    expect(searchSummary([])).toBeNull();
  });

  it("totals the window, orders days by date and lists the top 10 queries by clicks", () => {
    const queries = Array.from({ length: 12 }, (_, i) => gsc("gsc_query", `query ${i}`, i, 100));
    const summary = searchSummary([
      gsc("gsc_daily", "2026-09-02", 3, 40),
      gsc("gsc_daily", "2026-09-01", 2, 30),
      gsc("gsc_prior_daily", "2026-08-01", 99, 999),
      ...queries,
      {
        collector: "search-console",
        kind: "gsc_summary",
        subject: "sc-domain:docs.example.com",
        value: { startDate: "2026-09-01", endDate: "2026-09-28", days: 2 },
      },
    ]);
    expect(summary).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-09-28",
      clicks: 5,
      impressions: 70,
      days: [
        { date: "2026-09-01", clicks: 2, impressions: 30 },
        { date: "2026-09-02", clicks: 3, impressions: 40 },
      ],
    });
    expect(summary?.topQueries).toHaveLength(10);
    expect(summary?.topQueries[0]).toEqual({
      query: "query 11",
      clicks: 11,
      impressions: 100,
      position: 7.25,
    });
  });

  it("summarises an empty report (an ok run with no rows) as zero days", () => {
    const summary = searchSummary([
      {
        collector: "search-console",
        kind: "gsc_summary",
        subject: "sc-domain:docs.example.com",
        value: { startDate: "2026-09-01", endDate: "2026-09-28" },
      },
    ]);
    expect(summary).toMatchObject({ days: [], clicks: 0, impressions: 0, topQueries: [] });
  });
});
