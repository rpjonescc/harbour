import { crawlContext as context, crawl, html, NO_HTML } from "@/tests/helpers/crawl";
import { fixtureSite } from "@/tests/helpers/fixture-site";
import { closeSites, site } from "@/tests/helpers/http-site";
import { createCrawler } from "./crawler";

afterEach(closeSites);

const ms = expect.any(Number);

describe("crawler on a recorded site", () => {
  it("records exact page and site observations", async () => {
    const { origin } = await fixtureSite("acme-docs");
    const { pages, site: summary, subject } = await crawl(context(`${origin}/`));
    const page = (path: string, value: Record<string, unknown>) => ({
      kind: "page",
      subject: `${origin}${path}`,
      value: { status: 200, finalUrl: `${origin}${path}`, ms, truncated: false, ...value },
    });
    const none = { robotsMeta: null, noindex: false, canonical: null, images: 0 };
    const noNews = {
      ...{ articleDatePublished: null, preferredSourcesLink: false },
      ...{ questionHeadings: 0, conciseAnswers: 0 },
      ...{ noSnippet: false, nosnippetWords: 0 },
    };
    expect(pages).toEqual([
      page("/", {
        ...noNews,
        ...{ title: "Acme Docs", titleLength: 9, h1Count: 1, lang: "en", robotsMeta: null },
        metaDescription: "Documentation for Acme, a fictional example product.",
        ...{ descriptionLength: 52, canonical: `${origin}/`, noindex: false },
        ...{ jsonLdTypes: ["Organization", "WebSite"], invalidJsonLd: 0, hasFaqMarkup: false },
        ...{ wordCount: 13, internalLinks: 4, externalLinks: 1, images: 2, imagesMissingAlt: 1 },
      }),
      page("/about", {
        ...noNews,
        ...{ title: null, titleLength: 0, metaDescription: null, descriptionLength: 0 },
        ...{ h1Count: 0, canonical: null, robotsMeta: "noindex, follow", noindex: true },
        ...{ lang: null, jsonLdTypes: [], invalidJsonLd: 0, hasFaqMarkup: false, wordCount: 6 },
        ...{ internalLinks: 2, externalLinks: 0, images: 0, imagesMissingAlt: 0 },
      }),
      page("/guides/faq", {
        ...noNews,
        ...{ title: "Acme Docs", titleLength: 9, h1Count: 1, lang: "en", ...none },
        ...{ metaDescription: "Answers to common questions.", descriptionLength: 28 },
        ...{ jsonLdTypes: ["FAQPage"], invalidJsonLd: 1, hasFaqMarkup: true, wordCount: 11 },
        ...{ internalLinks: 1, externalLinks: 0, imagesMissingAlt: 0 },
        ...{ questionHeadings: 1, conciseAnswers: 1 },
      }),
      {
        kind: "page",
        subject: `${origin}/missing`,
        value: { status: 404, finalUrl: `${origin}/missing`, ms, truncated: false, ...NO_HTML },
      },
      page("/orphan", {
        ...noNews,
        ...{ title: "Orphaned page", titleLength: 13, h1Count: 1, lang: "en", ...none },
        ...{ metaDescription: null, descriptionLength: 0, jsonLdTypes: [], invalidJsonLd: 0 },
        ...{ hasFaqMarkup: false, wordCount: 5, internalLinks: 1, externalLinks: 0 },
        imagesMissingAlt: 0,
      }),
    ]);
    expect(subject).toBe(`${origin}/`);
    expect(summary).toEqual({
      pagesCrawled: 5,
      pagesInSitemap: 5,
      sitemapLastmods: {
        dated: 1,
        newest: [{ url: `${origin}/guides/faq`, lastmod: "2026-09-20T00:00:00.000Z" }],
      },
      brokenInternalLinks: [
        { from: `${origin}/`, to: `${origin}/missing`, status: 404 },
        { from: `${origin}/about`, to: `${origin}/missing`, status: 404 },
      ],
      duplicateTitles: [{ title: "Acme Docs", urls: [`${origin}/`, `${origin}/guides/faq`] }],
      avgMs: ms,
      robotsTxt: "ok",
      sitemapsRead: 3,
      sitemapErrors: [],
      sitemapPages: { crawled: 4, ok: 4 },
      blockedByRobots: 1,
      fetchErrors: [],
      limitReached: null,
    });
  });

  it("never requests a robots-disallowed page or another origin", async () => {
    const { origin, hits } = await fixtureSite("acme-docs");
    await crawl(context(`${origin}/`));
    expect(hits).not.toContain("/private/secret");
    expect(new Set(hits)).toEqual(
      new Set([
        "/",
        "/robots.txt",
        "/sitemap-index.xml",
        "/sitemap.xml",
        "/sitemap-pages.xml",
        "/sitemap-guides.xml",
        "/about",
        "/orphan",
        "/guides/faq",
        "/missing",
      ]),
    );
  });

  it("stops at the page cap and says so", async () => {
    const { origin } = await fixtureSite("acme-docs");
    const { pages, site: summary } = await crawl(context(`${origin}/`, {}, 2));
    expect(pages.map((p) => p.subject)).toEqual([`${origin}/`, `${origin}/about`]);
    expect(summary).toMatchObject({ pagesCrawled: 2, limitReached: "pages" });
  });

  it("records the sitemap's page URLs for the indexing check, capped at the crawl limit", async () => {
    const { origin } = await fixtureSite("acme-docs");
    const result = await createCrawler().collect(context(`${origin}/`, {}, 3));
    if (result.status !== "ok") throw new Error("expected ok");
    const listed = result.observations.filter((o) => o.kind === "sitemap_urls");
    expect(listed).toHaveLength(1);
    const urls = listed.flatMap((o) => o.value.urls as string[]);
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => u.startsWith(origin))).toBe(true);
    // The site summary stays the last observation.
    expect(result.observations.at(-1)?.kind).toBe("site");
  });

  it("records no sitemap_urls observation when there is no sitemap", async () => {
    const { origin } = await site({ "/": html("Home") });
    const result = await createCrawler().collect(context(`${origin}/`));
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.observations.some((o) => o.kind === "sitemap_urls")).toBe(false);
  });
});
