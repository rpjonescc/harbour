import {
  ANSWERS,
  cleanCredentials,
  indexingRun,
  inspectionApi,
  ORIGIN,
  observed,
  PROPERTY,
  page,
  pages,
  TOKEN,
} from "@/tests/helpers/url-inspection";

afterEach(cleanCredentials);

describe("indexing collector: what it asks and records", () => {
  it("asks URL Inspection about each sitemap page, one at a time, with the bearer token", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(3) });
    expect(result.status).toBe("ok");
    expect(api.calls.map((c) => c.inspected)).toEqual(pages(3));
    const [first] = api.calls;
    expect(first?.url).toBe("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect");
    expect(first?.options).toMatchObject({
      post: { json: { inspectionUrl: page(1), siteUrl: PROPERTY }, bearer: TOKEN },
      ignoreRobots: true,
      timeoutMs: 30_000,
      maxBytes: 1024 * 1024,
      onOverflow: "error",
    });
  });

  it("maps every state Google can report to Harbour's small set", async () => {
    const answers = [
      ANSWERS.indexed,
      ANSWERS.discovered,
      ANSWERS.crawled,
      ANSWERS.unknown,
      ANSWERS.blocked,
      ANSWERS.other,
    ];
    const api = inspectionApi((_u, n) => ({ body: answers[n - 1] ?? "" }));
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(6) });
    const states = observed(result, "index_status").map((o) => [o.subject, o.value.state]);
    expect(states).toEqual([
      [page(1), "indexed"],
      [page(2), "discovered_not_indexed"],
      [page(3), "crawled_not_indexed"],
      [page(4), "unknown_to_google"],
      [page(5), "blocked"],
      [page(6), "other"],
    ]);
  });

  it("stores Google's words, canonical and crawl time, and the check time", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(1) });
    expect(observed(result, "index_status")[0]?.value).toEqual({
      state: "indexed",
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      lastCrawlTime: "2026-09-28T04:10:00.000Z",
      googleCanonical: `${ORIGIN}/a`,
      robotsTxtState: "ALLOWED",
      pageFetchState: "SUCCESSFUL",
      checkedAt: "2026-10-02T06:00:00.000Z",
    });
  });

  it("reports the run: how many pages have a status, by state, and how far it has got", async () => {
    const api = inspectionApi((u) => ({
      body: u === page(2) ? ANSWERS.discovered : ANSWERS.indexed,
    }));
    const { result, log } = await indexingRun({ fetch: api.fetch, urls: pages(3) });
    const [summary] = observed(result, "index_summary");
    expect(summary?.subject).toBe(PROPERTY);
    expect(summary?.value).toEqual({
      inspected: 3,
      total: 3,
      byState: {
        indexed: 2,
        discovered_not_indexed: 1,
        crawled_not_indexed: 0,
        unknown_to_google: 0,
        blocked: 0,
        other: 0,
        unknown: 0,
      },
      checkedThrough: "2026-10-02T06:00:00.000Z",
      checkedThisRun: 3,
      stoppedBy: null,
      sitemapSeenSince: "2026-10-02T06:00:00.000Z",
    });
    expect(log.at(-1)).toBe("Asked Google about 3 pages: 3 of 3 now have a known status");
  });
});

describe("indexing collector: not run", () => {
  it("is not configured, with the Search Console wording, without credentials", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const { result } = await indexingRun({ fetch: api.fetch, credentials: false });
    expect(result).toMatchObject({ status: "not_configured" });
    expect(result.status === "not_configured" && result.reason).toContain(
      "HARBOUR_GSC_CREDENTIALS",
    );
    expect(api.calls).toEqual([]);
  });

  it("is not configured without the product's property", async () => {
    const { result } = await indexingRun({ property: null });
    expect(result.status).toBe("not_configured");
  });

  it("is skipped when the crawler did not run ok or found no sitemap pages", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    expect((await indexingRun({ fetch: api.fetch, crawler: "failed" })).result.status).toBe(
      "skipped",
    );
    expect((await indexingRun({ fetch: api.fetch, urls: [] })).result.status).toBe("skipped");
    expect(api.calls).toEqual([]);
  });

  it("drops sitemap entries that are not http(s) URLs or are huge, and counts each URL once", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const urls = [
      page(1),
      page(1),
      "javascript:alert(1)",
      "not a url",
      `${ORIGIN}/${"x".repeat(2500)}`,
    ];
    const { result } = await indexingRun({ fetch: api.fetch, urls });
    expect(api.calls.map((c) => c.inspected)).toEqual([page(1)]);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({ total: 1 });
  });
});
