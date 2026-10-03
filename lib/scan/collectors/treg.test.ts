import { DOMAIN, fakeTreg, KEY, observed, TRACKING, tregRun } from "@/tests/helpers/fake-treg";
import { closeSites } from "@/tests/helpers/http-site";
import { aiAnswerValue, backlinksValue, serpRankValue, tregSummaryValue } from "../treg-shapes";
import { ceilingHeaderValue, ceilingMicroUsd } from "./treg-endpoints";

afterEach(closeSites);

const everything = (run: Awaited<ReturnType<typeof tregRun>>) =>
  JSON.stringify([run.result, run.error?.message, run.log, run.spent]);

describe("treg collector: a normal run", () => {
  it("answers all three checks and reads them back through the shared shapes", async () => {
    const { origin, calls } = await fakeTreg({
      answers: { rank: 4, text: "Acme Docs is a good option.", sources: [`https://${DOMAIN}/a`] },
    });
    const run = await tregRun({ origin });
    expect(run.result?.status).toBe("ok");

    const [backlinks] = observed(run.result, "backlinks");
    expect(backlinks?.subject).toBe(DOMAIN);
    expect(backlinksValue.parse(backlinks?.value)).toMatchObject({
      referringDomains: 40,
      ownDomainExcluded: false,
      backlinks: 120,
      dofollow: 80,
      rank: 12.5,
      provider: "serpstat",
      checkedAt: "2026-10-04T06:00:00.000Z",
    });

    const ranks = observed(run.result, "serp_rank");
    expect(ranks.map((o) => o.subject)).toEqual(TRACKING.queries);
    expect(serpRankValue.parse(ranks[0]?.value)).toMatchObject({
      query: "acme docs",
      position: 4,
      url: `https://${DOMAIN}/guide`,
      topDomains: [
        "site-1.example.net",
        "site-2.example.net",
        "site-3.example.net",
        DOMAIN,
        "site-5.example.net",
      ],
    });

    const [answer] = observed(run.result, "ai_answer");
    expect(answer?.subject).toBe(TRACKING.questions[0]);
    expect(aiAnswerValue.parse(answer?.value)).toMatchObject({
      named: true,
      cited: true,
      citedDomains: [DOMAIN],
      businessesNamed: 2,
    });

    const [summary] = observed(run.result, "treg_summary");
    expect(tregSummaryValue.parse(summary?.value)).toEqual({
      attempted: 4,
      ok: 4,
      failed: 0,
      spentMicroUsd: 2_500 + 6_000 + 6_000 + 3_600,
      stoppedBy: "done",
      problems: [],
    });
    expect(calls.map((c) => c.endpoint)).toEqual([
      "serpstat.web.backlinks.summary",
      "dataforseo.google.serp.organic",
      "dataforseo.google.serp.organic",
      "cloro.ai-search.chatgpt.scrape",
    ]);
  });

  it("sends the key and a price ceiling of 1.5 times the estimate, as headers", async () => {
    const { origin, calls } = await fakeTreg();
    await tregRun({ origin });
    expect(
      calls.map((c) => [c.headers["x-treg-token"], c.headers["x-treg-route-max-cost"]]),
    ).toEqual([
      [KEY, "0.00375"],
      [KEY, "0.009"],
      [KEY, "0.009"],
      [KEY, "0.0054"],
    ]);
    expect(calls.every((c) => c.headers.authorization === undefined)).toBe(true);
  });

  it("never sets a ceiling above US$0.05", () => {
    expect(ceilingMicroUsd(100_000)).toBe(50_000);
    expect(ceilingHeaderValue(ceilingMicroUsd(100_000))).toBe("0.05");
    expect(ceilingMicroUsd(2_500)).toBe(3_750);
  });

  it("builds each request from the pinned endpoint bodies", async () => {
    const { origin, calls } = await fakeTreg();
    await tregRun({ origin });
    expect(calls[0]?.json).toEqual({
      method: "SerpstatBacklinksProcedure.getSummaryV2",
      id: "1",
      params: { query: DOMAIN },
    });
    expect(calls[1]?.json).toEqual([
      { keyword: "acme docs", location_name: "Australia", language_code: "en", depth: 30 },
    ]);
    expect(calls[3]?.json).toEqual({
      country: "AU",
      prompt: "What are good tools for team documentation?",
    });
  });

  it("searches from the owner's location and language when given", async () => {
    const { origin, calls } = await fakeTreg();
    const tracking = { ...TRACKING, location: "Queensland,Australia", languageCode: "en-GB" };
    await tregRun({ origin, tracking });
    expect(calls[1]?.json).toEqual([
      {
        keyword: "acme docs",
        location_name: "Queensland,Australia",
        language_code: "en-GB",
        depth: 30,
      },
    ]);
  });

  it("logs the endpoints it used and counts only", async () => {
    const { origin } = await fakeTreg();
    const run = await tregRun({ origin });
    expect(run.log[0]).toContain("serpstat.web.backlinks.summary");
    expect(run.log[0]).toContain("cloro.ai-search.chatgpt.scrape");
    expect(run.log.at(-1)).toBe("4 of 4 outside-view checks answered; the run ended: done");
  });
});

describe("treg collector: not configured", () => {
  it.each([
    ["no tracking entry", { tracking: null }],
    [
      "an entry with no searches or questions",
      { tracking: { ...TRACKING, queries: [], questions: [] } },
    ],
  ])("is not configured with %s, and calls nothing", async (_name, setup) => {
    const { origin, calls } = await fakeTreg();
    const run = await tregRun({ origin, ...setup });
    expect(run.result).toEqual({ status: "not_configured", reason: "No searches chosen yet" });
    expect(calls).toEqual([]);
    expect(run.spent.estimates).toEqual([]);
  });

  it("is not configured without a key, after the searches are chosen", async () => {
    const { origin, calls } = await fakeTreg();
    const run = await tregRun({ origin, key: null });
    expect(run.result?.status).toBe("not_configured");
    expect(run.result).toMatchObject({ reason: expect.stringContaining("HARBOUR_TREG_API_KEY") });
    expect(calls).toEqual([]);
  });

  it("checks the searches first: with neither, the sentence is about searches", async () => {
    const { origin } = await fakeTreg();
    const run = await tregRun({ origin, key: null, tracking: null });
    expect(run.result).toMatchObject({ reason: "No searches chosen yet" });
  });
});

describe("treg collector: rank and answers", () => {
  it("keeps 'not in the top 30' as null: never 0 and never 31", async () => {
    const { origin } = await fakeTreg({ answers: { rank: null } });
    const run = await tregRun({ origin });
    const values = observed(run.result, "serp_rank").map((o) => serpRankValue.parse(o.value));
    expect(values.map((v) => [v.position, v.url])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(JSON.stringify(values)).not.toMatch(/"position":(0|31)/);
  });

  it("ignores a featured snippet or ad on our domain: only organic results count", async () => {
    const { origin } = await fakeTreg({ answers: { rank: null } });
    const run = await tregRun({ origin });
    expect(observed(run.result, "serp_rank")[0]?.value).toMatchObject({ position: null });
  });

  it("reports rank 30 and nothing deeper", async () => {
    const { origin } = await fakeTreg({ answers: { rank: 30 } });
    const run = await tregRun({ origin });
    expect(observed(run.result, "serp_rank")[0]?.value).toMatchObject({ position: 30 });
  });

  it("stores no answer text, and no source beyond the cited domains", async () => {
    const text = "SENTINEL-answer-text: Acme Docs is the best, says the answer.";
    const { origin } = await fakeTreg({
      answers: { text, sources: ["https://news.example.org/a/very/long/path?q=1"] },
    });
    const run = await tregRun({ origin });
    const stored = JSON.stringify(run.result);
    expect(stored).not.toContain("SENTINEL-answer-text");
    expect(stored).not.toContain("very/long/path");
    expect(JSON.stringify(run.log)).not.toContain("SENTINEL-answer-text");
    expect(observed(run.result, "ai_answer")[0]?.value).toMatchObject({
      named: true,
      cited: false,
      citedDomains: ["news.example.org"],
    });
  });

  it.each([
    ["the name, in any case", "Try ACME DOCS for this.", true],
    ["the domain", "See docs.example.com/guide for more.", true],
    ["the name inside a longer word", "Acme Docsville is a town.", false],
    ["the name beside a letter", "SuperAcme Docs", false],
    ["neither", "Other tools exist.", false],
  ])("says named for %s: %s", async (_name, text, named) => {
    const { origin } = await fakeTreg({ answers: { text } });
    const run = await tregRun({ origin });
    expect(observed(run.result, "ai_answer")[0]?.value).toMatchObject({ named });
  });

  it("matches a product named like a regular expression literally", async () => {
    const name = "A.+(B[x]*";
    const hit = await fakeTreg({ answers: { text: `People like ${name} a lot.` } });
    const hitRun = await tregRun({ origin: hit.origin, product: { name } });
    expect(observed(hitRun.result, "ai_answer")[0]?.value).toMatchObject({ named: true });
    const miss = await fakeTreg({ answers: { text: "AxxxxB is not it, and AB neither." } });
    const missRun = await tregRun({ origin: miss.origin, product: { name } });
    expect(observed(missRun.result, "ai_answer")[0]?.value).toMatchObject({ named: false });
  });

  it("is not fooled by hidden characters inside the text", async () => {
    const { origin } = await fakeTreg({ answers: { text: "Use Acme\u200b Docs today" } });
    const run = await tregRun({ origin });
    // The zero-width space is removed before looking, leaving "Acme Docs".
    expect(observed(run.result, "ai_answer")[0]?.value).toMatchObject({ named: true });
  });

  it.each([
    ["the domain", `https://${DOMAIN}/x`, true],
    ["www of the domain", `https://www.${DOMAIN}/x`, true],
    ["a subdomain", `https://blog.${DOMAIN}/x`, true],
    ["a lookalike", "https://notdocs.example.com/x", false],
    ["the domain as a prefix of another", `https://${DOMAIN}.evil.example.net/x`, false],
    ["a non-http link", `ftp://${DOMAIN}/x`, false],
  ])("says cited for %s: %s", async (_name, url, cited) => {
    const { origin } = await fakeTreg({ answers: { sources: [url] } });
    const run = await tregRun({ origin });
    expect(observed(run.result, "ai_answer")[0]?.value).toMatchObject({ cited });
  });

  it("caps the cited domains at 8 and keeps null when the provider listed no businesses", async () => {
    const sources = Array.from({ length: 12 }, (_, i) => `https://s${i}.example.org/`);
    const { origin } = await fakeTreg({ answers: { sources, entities: null } });
    const run = await tregRun({ origin });
    const value = aiAnswerValue.parse(observed(run.result, "ai_answer")[0]?.value);
    expect(value.citedDomains).toHaveLength(8);
    expect(value.businessesNamed).toBeNull();
  });
});

describe("treg collector: nothing secret is kept", () => {
  it("never puts the key in a result, an error, a log line or a ledger entry", async () => {
    const { origin } = await fakeTreg();
    const run = await tregRun({ origin });
    expect(everything(run)).not.toContain(KEY);
    for (const mode of ["unauthorized", "balance", "server_error", "malformed"] as const) {
      const failing = await fakeTreg({ mode });
      const failed = await tregRun({ origin: failing.origin });
      expect(everything(failed), mode).not.toContain(KEY);
    }
  });
});
