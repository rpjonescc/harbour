import {
  ANSWERS,
  cleanCredentials,
  indexingRun,
  inspectionApi,
  observed,
  page,
  pages,
} from "@/tests/helpers/url-inspection";
import type { Observation } from "../types";

afterEach(cleanCredentials);

/** Runs the collector `days` times in a row, each run seeing the last one's observations. */
async function runDays(urls: string[], days: number, answer = ANSWERS.indexed) {
  let previous: Observation[] = [];
  const perRun: string[][] = [];
  const summaries: Record<string, unknown>[] = [];
  for (let day = 0; day < days; day++) {
    const api = inspectionApi(() => ({ body: answer }));
    const now = new Date(Date.UTC(2026, 9, 1 + day, 6));
    const { result } = await indexingRun({ fetch: api.fetch, urls, previous, now });
    if (result.status !== "ok") throw new Error("expected ok");
    previous = result.observations;
    perRun.push(api.calls.map((c) => c.inspected));
    summaries.push(observed(result, "index_summary")[0]?.value ?? {});
  }
  return { perRun, summaries, previous };
}

describe("indexing collector: rotation and carry-over", () => {
  it("checks at most 100 pages a run, never-checked first, so 250 pages are all covered by the third run", async () => {
    const urls = pages(250);
    const { perRun, summaries, previous } = await runDays(urls, 3);
    expect(perRun.map((r) => r.length)).toEqual([100, 100, 100]);
    expect(perRun[0]).toEqual(urls.slice(0, 100));
    expect(perRun[1]).toEqual(urls.slice(100, 200));
    // A run with room left over refreshes the oldest checks.
    expect(perRun[2]).toEqual([...urls.slice(200), ...urls.slice(0, 50)]);
    expect(new Set(perRun.flat()).size).toBe(250);
    expect(summaries.map((s) => [s.inspected, s.total, s.checkedThisRun])).toEqual([
      [100, 250, 100],
      [200, 250, 100],
      [250, 250, 100],
    ]);
    expect(previous.filter((o) => o.kind === "index_status")).toHaveLength(250);
  });

  it("then goes back to the oldest check first", async () => {
    const urls = pages(150);
    const { perRun } = await runDays(urls, 3);
    expect(perRun[0]).toEqual(urls.slice(0, 100));
    expect(perRun[1]).toEqual([...urls.slice(100), ...urls.slice(0, 50)]);
    // Day 3: pages 51 to 100 were checked on day 1, the rest on day 2.
    expect(perRun[2]).toEqual([...urls.slice(50, 100), ...urls.slice(0, 50)]);
  });

  it("carries earlier statuses into each run and says how far the oldest check goes back", async () => {
    const { summaries } = await runDays(pages(150), 2);
    expect(summaries[1]).toMatchObject({
      inspected: 150,
      total: 150,
      checkedThrough: "2026-10-01T06:00:00.000Z",
      sitemapSeenSince: "2026-10-01T06:00:00.000Z",
    });
  });

  it("forgets pages that left the sitemap and checks a new page first", async () => {
    const first = await runDays(pages(3), 1);
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const { result } = await indexingRun({
      fetch: api.fetch,
      urls: [page(2), page(3), page("new")],
      previous: first.previous,
      now: new Date("2026-10-02T06:00:00Z"),
    });
    expect(api.calls[0]?.inspected).toBe(page("new"));
    expect(observed(result, "index_status").map((o) => o.subject)).toEqual([
      page(2),
      page(3),
      page("new"),
    ]);
  });

  it("ignores earlier observations that are malformed", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const junk: Observation[] = [
      { kind: "index_status", subject: page(1), value: { state: "bogus" } },
      { kind: "index_status", subject: "javascript:x", value: {} },
      { kind: "index_summary", subject: "x", value: { sitemapSeenSince: 5 } },
    ];
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(1), previous: junk });
    expect(api.calls).toHaveLength(1);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({
      sitemapSeenSince: "2026-10-02T06:00:00.000Z",
    });
  });
});
