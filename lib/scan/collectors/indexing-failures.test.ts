import { hasControlChars, hasInvisible } from "@/lib/text/hidden-chars";
import {
  ANSWERS,
  cleanCredentials,
  googleError,
  indexingRun,
  inspection,
  inspectionApi,
  observed,
  page,
  pages,
  TOKEN,
} from "@/tests/helpers/url-inspection";

afterEach(cleanCredentials);

const states = (result: Awaited<ReturnType<typeof indexingRun>>["result"]) =>
  observed(result, "index_status").map((o) => o.value.state);

describe("indexing collector: failures", () => {
  it.each([401, 403])(
    "fails with the access message on HTTP %i, never including the token",
    async (status) => {
      const api = inspectionApi(() => ({ status, body: googleError(status, "Permission denied") }));
      const run = indexingRun({ fetch: api.fetch });
      await expect(run).rejects.toThrow(
        /Search Console refused access to sc-domain:docs.example.com/,
      );
      await run.catch((error: Error) => {
        expect(error.message).toContain("check the property is shared");
        expect(error.message).not.toContain(TOKEN);
        expect(error.cause).toBeUndefined();
      });
      expect(api.calls).toHaveLength(1);
    },
  );

  it("keeps what it has and says to wait for tomorrow on HTTP 429", async () => {
    const api = inspectionApi((_u, n) =>
      n <= 2
        ? { body: ANSWERS.indexed }
        : { status: 429, body: googleError(429, "Quota", "rateLimitExceeded") },
    );
    const { result, log } = await indexingRun({ fetch: api.fetch, urls: pages(5) });
    expect(states(result)).toEqual(["indexed", "indexed"]);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({
      inspected: 2,
      total: 5,
      stoppedBy: "quota",
    });
    expect(log[0]).toContain("tomorrow's check");
    expect(api.calls).toHaveLength(3);
  });

  it("treats a quota reason on another status as quota too", async () => {
    const api = inspectionApi(() => ({
      status: 400,
      body: googleError(400, "x", "quotaExceeded"),
    }));
    const { result } = await indexingRun({ fetch: api.fetch });
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({ stoppedBy: "quota" });
  });

  it("records a page it could not check as unknown and carries on", async () => {
    const api = inspectionApi((u) =>
      u === page(2) ? { status: 500, body: "oops" } : { body: ANSWERS.indexed },
    );
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(3) });
    expect(states(result)).toEqual(["indexed", "unknown", "indexed"]);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({ inspected: 2, total: 3 });
  });

  it.each([
    ["malformed JSON", { body: "{not json" }],
    ["an unexpected shape", { body: JSON.stringify({ inspectionResult: {} }) }],
    ["wrong types", { body: inspection({ verdict: 7, coverageState: ["x"] }) }],
    ["an empty verdict", { body: inspection({ verdict: "  ", coverageState: "x" }) }],
    ["a hung request", "hang" as const],
    ["a network error (or a body over 1 MiB)", "error" as const],
  ])("leaves the page unknown after %s", async (_name, answer) => {
    const api = inspectionApi(() => answer);
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(1) });
    expect(states(result)).toEqual(["unknown"]);
  });

  it("stops after five pages in a row could not be checked", async () => {
    const api = inspectionApi(() => "hang");
    const { result, log } = await indexingRun({ fetch: api.fetch, urls: pages(50) });
    expect(api.calls).toHaveLength(5);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({ stoppedBy: "errors" });
    expect(log[0]).toContain("several pages in a row");
  });

  it("keeps a page's earlier status when a later check of it fails, and retries it first", async () => {
    const good = inspectionApi(() => ({ body: ANSWERS.discovered }));
    const first = await indexingRun({
      fetch: good.fetch,
      urls: pages(2),
      now: new Date("2026-10-01T06:00:00Z"),
    });
    if (first.result.status !== "ok") throw new Error("expected ok");
    const bad = inspectionApi(() => ({ status: 500, body: "" }));
    const second = await indexingRun({
      fetch: bad.fetch,
      urls: pages(2),
      previous: first.result.observations,
      now: new Date("2026-10-02T06:00:00Z"),
    });
    expect(states(second.result)).toEqual(["discovered_not_indexed", "discovered_not_indexed"]);
    const checked = observed(second.result, "index_status").map((o) => o.value.checkedAt);
    expect(checked).toEqual(["2026-10-01T06:00:00.000Z", "2026-10-01T06:00:00.000Z"]);
  });

  it("stops at its own time limit", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    let now = 0;
    const { result, log } = await indexingRun({
      fetch: api.fetch,
      urls: pages(50),
      clock: () => (now += 60_000),
    });
    expect(api.calls.length).toBeLessThan(10);
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({ stoppedBy: "time" });
    expect(log[0]).toContain("time allowed");
  });

  it("stops promptly when aborted", async () => {
    const controller = new AbortController();
    const api = inspectionApi((_u, n) => {
      if (n === 2) controller.abort(new Error("Cancelled"));
      return { body: ANSWERS.indexed };
    });
    await expect(
      indexingRun({ fetch: api.fetch, urls: pages(10), signal: controller.signal }),
    ).rejects.toThrow("Cancelled");
    expect(api.calls).toHaveLength(2);
  });
});

describe("indexing collector: hostile answers", () => {
  it("cleans control and hidden characters, caps text, and drops a non-URL canonical", async () => {
    const hostile = inspection({
      verdict: "PASS",
      coverageState: `Indexed\u202e \u001b[31mred\u200b${"y".repeat(500)}`,
      robotsTxtState: "ALLOWED\u0000",
      pageFetchState: "<script>alert(1)</script>",
      lastCrawlTime: "not a date",
      googleCanonical: "javascript:alert(1)",
      extra: { nested: "ignored" },
    });
    const api = inspectionApi(() => ({ body: hostile }));
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(1) });
    const value = observed(result, "index_status")[0]?.value;
    const covered = String(value?.coverageState);
    expect(covered.length).toBeLessThanOrEqual(200);
    expect(hasControlChars(covered) || hasInvisible(covered)).toBe(false);
    expect(covered).toContain("Indexed");
    expect(value).toMatchObject({
      robotsTxtState: "ALLOWED",
      pageFetchState: "<script>alert(1)</script>",
      lastCrawlTime: null,
      googleCanonical: null,
    });
    expect(value).not.toHaveProperty("extra");
  });
});
