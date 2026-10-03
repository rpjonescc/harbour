import { ACME_CRAWL, ALL_OK, crawlSite, htmlPage, readiness } from "@/tests/helpers/scoring";
import { deriveIssues as derive, evaluateRules } from "./issues";
import type { ScanObservation } from "./types";

/** Issues with every collector ok: these tests are about the rules, not collector failures. */
const deriveIssues = (observations: ScanObservation[]) => derive(observations, ALL_OK, "product");

const at = (path: string) => `https://docs.example.com${path}`;
const ids = (issues: ReturnType<typeof deriveIssues>) => issues.map((issue) => issue.id);

describe("deriveIssues", () => {
  it("finds noindex pages and broken links in Acme Docs' scan, not its training-crawler block", () => {
    const issues = deriveIssues([...ACME_CRAWL, readiness()]);
    // Only a training crawler is blocked: the owner's choice, not an action (formula v3).
    expect(ids(issues)).toEqual(["broken-links", "noindex"]);
    const [broken, noindex] = issues;
    expect(broken).toMatchObject({
      area: "SEO",
      impact: "high",
      title: "1 page you link to can't be found",
      total: 1,
      locations: [`${at("/missing")} (HTTP 404), linked from ${at("/")}, ${at("/about")}`],
    });
    // /old redirects to /about: one page, listed once.
    expect(noindex).toMatchObject({
      title: "1 page is hidden from search",
      locations: [at("/about")],
    });
  });

  it("rates a blocked AI search crawler as high impact", () => {
    const blocked = readiness({
      robotsTxt: {
        state: "ok",
        aiCrawlerAccess: {
          "OAI-SearchBot": "blocked",
          PerplexityBot: "blocked",
          GPTBot: "allowed",
        },
      },
    });
    expect(deriveIssues([blocked])[0]).toMatchObject({
      id: "ai-crawlers-blocked",
      impact: "high",
      title: "AI assistants can't read your site",
    });
  });

  it("names every AI search agent in the robots.txt fix", () => {
    const blocked = readiness({
      robotsTxt: { state: "ok", aiCrawlerAccess: { PerplexityBot: "blocked" } },
    });
    expect(deriveIssues([blocked])[0]?.fix).toContain(
      "(OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot)",
    );
  });

  it("raises no readiness issue for a malformed product URL", () => {
    const bad = { ...readiness({ llmsTxt: { present: false } }), subject: "not a url" };
    expect(deriveIssues([bad])).toEqual([]);
  });

  it("finds missing titles and descriptions on HTML pages only", () => {
    const issues = deriveIssues([
      htmlPage("/a", { title: null, titleLength: 0, descriptionLength: 0 }),
      htmlPage("/b", { title: null, titleLength: 0 }),
      htmlPage("/c"),
      crawlSite({ brokenInternalLinks: [] }),
    ]);
    expect(ids(issues)).toEqual(["missing-title", "missing-description"]);
    expect(issues[0]).toMatchObject({ title: "2 pages are missing a title", total: 2 });
    expect(issues[0]?.locations).toEqual([at("/a"), at("/b")]);
    expect(issues[1]).toMatchObject({
      title: "1 page has no summary for search results",
      impact: "medium",
    });
  });

  it("caps listed locations at 20 but counts them all", () => {
    const pages = Array.from({ length: 25 }, (_, i) =>
      htmlPage(`/p${i}`, { descriptionLength: 0 }),
    );
    const [issue] = deriveIssues(pages);
    expect(issue?.total).toBe(25);
    expect(issue?.locations).toHaveLength(20);
  });

  it("finds a missing Preferred Sources button on a news site, not llms.txt or FAQ markup", () => {
    const issues = derive(
      [
        htmlPage("/"),
        readiness({
          robotsTxt: { state: "ok", aiCrawlerAccess: null },
          llmsTxt: { present: false },
          schema: { pagesChecked: 3, pagesWith: { FAQPage: 0 } },
          preferredSources: { button: false },
        }),
      ],
      ALL_OK,
      "news",
    );
    // No llms.txt and no FAQ markup raise nothing since formula v3.
    expect(ids(issues)).toEqual(["no-preferred-sources"]);
  });

  it("raises nothing it cannot judge: unknown parts and malformed data are gaps", () => {
    const issues = deriveIssues([
      { collector: "crawler", kind: "page", subject: at("/"), value: { status: "200" } },
      readiness({
        robotsTxt: { state: "unavailable", aiCrawlerAccess: null },
        llmsTxt: { present: null },
        schema: null,
        preferredSources: null,
      }),
    ]);
    expect(issues).toEqual([]);
  });

  it("is empty without observations", () => {
    expect(deriveIssues([])).toEqual([]);
  });
});

describe("the no-preferred-sources rule", () => {
  const noButton = readiness({
    preferredSources: { button: false, buttonPages: [], freshUrls: 0, freshContent: false },
  });
  const outcome = (kind: "news" | "product") =>
    evaluateRules([...ACME_CRAWL, noButton], ALL_OK, kind).find(
      (o) => o.ruleId === "no-preferred-sources",
    );

  it("fires for a news site", () => {
    expect(outcome("news")?.state).toBe("present");
  });

  it("never applies to a product site, whatever the page carries", () => {
    expect(outcome("product")?.state).toBe("clear");
  });

  it("stays unknown when readiness didn't run ok, for either kind (a gap, not a resolution)", () => {
    const statuses = { ...ALL_OK, readiness: "failed" as const };
    for (const kind of ["news", "product"] as const) {
      const found = evaluateRules([...ACME_CRAWL, noButton], statuses, kind).find(
        (o) => o.ruleId === "no-preferred-sources",
      );
      expect(found?.state).toBe("unknown");
    }
  });
});
