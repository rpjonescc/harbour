import { INDEXING_REASONS } from "@/lib/explain/indexing";
import {
  ANSWERS,
  cleanCredentials,
  indexingRun,
  inspectionApi,
  observed,
  page,
  pages,
  TOKEN,
} from "@/tests/helpers/url-inspection";
import type { Observation } from "../types";

afterEach(cleanCredentials);

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 6));

/** Runs on `n`, each seeing the previous run's observations; `fails` says which pages get a 500. */
async function run(
  n: number,
  urls: string[],
  previous: Observation[],
  fails: (u: string) => boolean,
) {
  const api = inspectionApi((u) =>
    fails(u) ? { status: 500, body: "" } : { body: ANSWERS.indexed },
  );
  const { result } = await indexingRun({ fetch: api.fetch, urls, previous, now: day(n) });
  if (result.status !== "ok") throw new Error("expected ok");
  return { asked: api.calls.map((c) => c.inspected), observations: result.observations, result };
}

describe("indexing collector: the queue", () => {
  it("retries a page that failed once before routine refreshes, behind pages never asked", async () => {
    const urls = pages(4);
    const first = await run(1, urls, [], (u) => u === page(2));
    // Day 2: page 2 failed (unknown, 1 failure); pages 1, 3, 4 are healthy. Add a new page 5.
    const second = await run(2, [...urls, page(5)], first.observations, () => false);
    expect(second.asked).toEqual([page(5), page(2), page(1), page(3), page(4)]);
  });

  it("asks about a failing page once a day, however often a check starts", async () => {
    const urls = pages(3);
    const first = await run(1, urls, [], (u) => u === page(2));
    const sameDay = await run(1, urls, first.observations, (u) => u === page(2));
    expect(sameDay.asked).toEqual([page(1), page(3)]);
  });

  it("rotates pages that keep failing behind every other page after two failures in a row", async () => {
    const urls = pages(8);
    const bad = new Set([page(1), page(2), page(3), page(4), page(5)]);
    let seen = (await run(1, urls, [], (u) => bad.has(u))).observations;
    seen = (await run(2, urls, seen, (u) => bad.has(u))).observations;
    // Day 3: the five old failures have two failures each and go after the healthy pages.
    const third = await run(3, urls, seen, (u) => bad.has(u));
    expect(third.asked.slice(0, 3)).toEqual([page(6), page(7), page(8)]);
    expect(new Set(third.asked.slice(3))).toEqual(bad);
    // The healthy pages were checked, so the run was not stopped by the failing ones' allowance.
    expect(observed(third.result, "index_summary")[0]?.value).toMatchObject({ inspected: 3 });
  });

  it("clears a page's failures when a check succeeds", async () => {
    const urls = pages(1);
    const failed = await run(1, urls, [], () => true);
    const recovered = await run(2, urls, failed.observations, () => false);
    const status = observed(recovered.result, "index_status")[0]?.value;
    expect(status).toMatchObject({ state: "indexed" });
    expect(status).not.toHaveProperty("failures");
  });
});

describe("indexing collector: counting and wording", () => {
  it("does not count the request Google refused for quota", async () => {
    const quota = JSON.stringify({ error: { code: 429, message: "Quota", errors: [] } });
    const api = inspectionApi((_u, n) =>
      n <= 2 ? { body: ANSWERS.indexed } : { status: 429, body: quota },
    );
    const { result } = await indexingRun({ fetch: api.fetch, urls: pages(5) });
    expect(observed(result, "index_summary")[0]?.value).toMatchObject({
      checkedThisRun: 2,
      stoppedBy: "quota",
    });
  });

  it("says '1 page' in the log for one page", async () => {
    const api = inspectionApi(() => ({ body: ANSWERS.indexed }));
    const { log } = await indexingRun({ fetch: api.fetch, urls: pages(1) });
    expect(log.at(-1)).toBe("Asked Google about 1 page: 1 of 1 now have a known status");
  });

  it("skips with different reasons for a failed crawler and an empty sitemap", async () => {
    const failed = await indexingRun({ crawler: "failed" });
    const empty = await indexingRun({ urls: [] });
    expect(failed.result).toEqual({ status: "skipped", reason: INDEXING_REASONS.crawlerFailed });
    expect(empty.result).toEqual({ status: "skipped", reason: INDEXING_REASONS.noSitemap });
  });

  it("keeps the token out of the result and the log in every outcome", async () => {
    const answers = [ANSWERS.indexed, ANSWERS.blocked, ANSWERS.other];
    const api = inspectionApi((_u, n) =>
      n === 2 ? { status: 500, body: `oops ${"x".repeat(10)}` } : { body: answers[n % 3] ?? "" },
    );
    const { result, log } = await indexingRun({ fetch: api.fetch, urls: pages(4) });
    expect(JSON.stringify({ result, log })).not.toContain(TOKEN);
  });
});
