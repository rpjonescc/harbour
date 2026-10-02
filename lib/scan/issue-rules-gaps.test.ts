import { ALL_OK, crawlSite, htmlPage, ORIGIN, readiness } from "@/tests/helpers/scoring";
import { evaluateRules, type RuleOutcome } from "./issues";
import type { ScanObservation } from "./types";

// A clear outcome resolves the owner's action, so a rule may only say "clear" when it saw
// enough of the site to be sure. These tests pin when a would-be clear becomes unknown.

const outcomes = (observations: ScanObservation[]) =>
  Object.fromEntries(evaluateRules(observations, ALL_OK, "product").map((o) => [o.ruleId, o]));

const unknown = (ruleId: string, reason: string): RuleOutcome => ({
  ruleId,
  state: "unknown",
  reason,
});

const clearCrawl = (site: Record<string, unknown> = {}) => [
  htmlPage("/"),
  htmlPage("/guide"),
  crawlSite({ brokenInternalLinks: [], ...site }),
  readiness({ robotsTxt: { state: "ok", aiCrawlerAccess: { GPTBot: "allowed" } } }),
];

/** Rules judged from the crawled pages or links: a partial crawl can hide their problem. */
const CRAWL_RULES = ["missing-title", "missing-description", "broken-links", "noindex"];
const PAGE_RULES = ["missing-title", "missing-description", "noindex"];

describe("partial crawls", () => {
  it("are clear when the crawl ran out of URLs and every page was fetched", () => {
    const found = outcomes(clearCrawl());
    for (const id of CRAWL_RULES) expect(found[id]?.state).toBe("clear");
  });

  it.each(["pages", "bytes"])(
    "are unknown, not clear, when the %s limit stopped the crawl",
    (limit) => {
      const found = outcomes(clearCrawl({ limitReached: limit }));
      for (const id of CRAWL_RULES) {
        expect(found[id]).toEqual(unknown(id, `Crawl stopped at the ${limit} limit`));
      }
    },
  );

  it("are unknown, not clear, when pages could not be fetched", () => {
    const one = outcomes(clearCrawl({ fetchErrors: [{ url: `${ORIGIN}/a`, kind: "timeout" }] }));
    expect(one.noindex).toEqual(unknown("noindex", "1 page could not be fetched"));
    const two = outcomes(
      clearCrawl({
        fetchErrors: [
          { url: `${ORIGIN}/a`, kind: "timeout" },
          { url: `${ORIGIN}/b`, kind: "network" },
        ],
      }),
    );
    expect(two["broken-links"]).toEqual(unknown("broken-links", "2 pages could not be fetched"));
  });

  it("stay clear when robots.txt kept the crawler out of some URLs (the owner's choice)", () => {
    const found = outcomes(clearCrawl({ blockedByRobots: 3 }));
    for (const id of CRAWL_RULES) expect(found[id]?.state).toBe("clear");
  });

  it("are unknown for page rules without the crawl's site summary", () => {
    const found = outcomes([htmlPage("/")]);
    for (const id of PAGE_RULES) {
      expect(found[id]).toEqual(unknown(id, "The crawl recorded no site summary"));
    }
  });

  it("still report a problem found on the pages that were crawled", () => {
    const found = outcomes([
      htmlPage("/", { titleLength: 0, descriptionLength: 0, noindex: true }),
      crawlSite({ limitReached: "pages" }),
    ]);
    for (const id of CRAWL_RULES) expect(found[id]?.state).toBe("present");
  });

  it("keep FAQ and Preferred Sources clear when a crawled page proves them", () => {
    const found = outcomes(clearCrawl({ limitReached: "pages" }));
    expect(found["no-faq-schema"]?.state).toBe("clear");
    expect(found["no-preferred-sources"]?.state).toBe("clear");
  });
});

describe("page facts that are null", () => {
  it("are unknown when no HTML page reported the field", () => {
    const found = outcomes([
      htmlPage("/", { descriptionLength: null, noindex: null }),
      htmlPage("/guide", { descriptionLength: null, noindex: null }),
      crawlSite({ brokenInternalLinks: [] }),
    ]);
    expect(found["missing-description"]?.state).toBe("unknown");
    expect(found.noindex?.state).toBe("unknown");
    expect(found["missing-title"]?.state).toBe("clear");
  });

  it("judge only the pages that reported the field", () => {
    const found = outcomes([
      htmlPage("/", { descriptionLength: null }),
      htmlPage("/guide", { descriptionLength: 0 }),
      crawlSite({ brokenInternalLinks: [] }),
    ]);
    const outcome = found["missing-description"];
    expect(outcome?.state).toBe("present");
    if (outcome?.state !== "present") return;
    expect(outcome.issue.locations).toEqual([`${ORIGIN}/guide`]);
  });
});

describe("unreadable page records", () => {
  it("turn a page rule's clear into unknown", () => {
    const malformed: ScanObservation = {
      collector: "crawler",
      kind: "page",
      subject: `${ORIGIN}/broken`,
      value: { status: "200" },
    };
    const found = outcomes([...clearCrawl(), malformed]);
    for (const id of PAGE_RULES) {
      expect(found[id]).toEqual(unknown(id, "1 page record unreadable"));
    }
    expect(found["broken-links"]?.state).toBe("clear");
  });
});

describe("ai-crawlers-blocked", () => {
  it("treats partial access as not blocked", () => {
    const found = outcomes([
      readiness({ robotsTxt: { state: "ok", aiCrawlerAccess: { PerplexityBot: "partial" } } }),
    ]);
    expect(found["ai-crawlers-blocked"]?.state).toBe("clear");
  });
});
