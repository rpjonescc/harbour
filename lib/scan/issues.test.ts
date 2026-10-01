import { ACME_CRAWL, crawlSite, htmlPage, readiness } from "@/tests/helpers/scoring";
import { deriveIssues } from "./issues";

const at = (path: string) => `https://docs.example.com${path}`;
const ids = (issues: ReturnType<typeof deriveIssues>) => issues.map((issue) => issue.id);

describe("deriveIssues", () => {
  it("finds noindex pages, broken links and blocked AI crawlers in Acme Docs' scan", () => {
    const issues = deriveIssues([...ACME_CRAWL, readiness()]);
    expect(ids(issues)).toEqual(["broken-links", "noindex", "ai-crawlers-blocked"]);
    const [broken, noindex, crawlers] = issues;
    expect(broken).toMatchObject({
      area: "SEO",
      impact: "high",
      title: "1 linked page is broken",
      total: 1,
      locations: [`${at("/missing")} (HTTP 404), linked from ${at("/")}, ${at("/about")}`],
    });
    // /old redirects to /about: one page, listed once.
    expect(noindex).toMatchObject({
      title: "1 page is hidden from search",
      locations: [at("/about")],
    });
    // Only a training crawler is blocked: worth knowing, not urgent.
    expect(crawlers).toMatchObject({
      area: "GEO",
      impact: "low",
      title: "robots.txt blocks GPTBot",
      locations: [at("/robots.txt")],
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
      title: "robots.txt blocks OAI-SearchBot and PerplexityBot",
    });
  });

  it("finds missing titles and descriptions on HTML pages only", () => {
    const issues = deriveIssues([
      htmlPage("/a", { title: null, titleLength: 0, descriptionLength: 0 }),
      htmlPage("/b", { title: null, titleLength: 0 }),
      htmlPage("/c"),
      crawlSite({ brokenInternalLinks: [] }),
    ]);
    expect(ids(issues)).toEqual(["missing-title", "missing-description"]);
    expect(issues[0]).toMatchObject({ title: "2 pages have no title", total: 2 });
    expect(issues[0]?.locations).toEqual([at("/a"), at("/b")]);
    expect(issues[1]).toMatchObject({ title: "1 page has no meta description", impact: "medium" });
  });

  it("caps listed locations at 20 but counts them all", () => {
    const pages = Array.from({ length: 25 }, (_, i) =>
      htmlPage(`/p${i}`, { descriptionLength: 0 }),
    );
    const [issue] = deriveIssues(pages);
    expect(issue?.total).toBe(25);
    expect(issue?.locations).toHaveLength(20);
  });

  it("finds a missing llms.txt, FAQ schema and Preferred Sources button", () => {
    const issues = deriveIssues([
      htmlPage("/"),
      readiness({
        robotsTxt: { state: "ok", aiCrawlerAccess: null },
        llmsTxt: { present: false },
        schema: { pagesChecked: 3, pagesWith: { FAQPage: 0 } },
        preferredSources: { button: false },
      }),
    ]);
    expect(ids(issues)).toEqual(["no-faq-schema", "no-llms-txt", "no-preferred-sources"]);
    expect(issues.find((i) => i.id === "no-llms-txt")?.locations).toEqual([at("/llms.txt")]);
  });

  it("counts FAQ microdata as FAQ markup", () => {
    const issues = deriveIssues([
      htmlPage("/faq", { hasFaqMarkup: true }),
      readiness({ schema: { pagesChecked: 1, pagesWith: { FAQPage: 0 } } }),
    ]);
    expect(ids(issues)).not.toContain("no-faq-schema");
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
