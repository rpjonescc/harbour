import type { CrawledPage } from "./crawl-page";
import { sitemapPages, summarisePages } from "./crawl-summary";

const origin = "https://docs.example.com";
const pad = (n: number) => String(n).padStart(3, "0");

function page(path: string, status: number, title: string | null, ms = 10): CrawledPage {
  return {
    status,
    finalUrl: `${origin}${path}`,
    ms,
    truncated: false,
    title,
    titleLength: title?.length ?? null,
    metaDescription: null,
    descriptionLength: null,
    h1Count: null,
    canonical: null,
    robotsMeta: null,
    noindex: null,
    lang: null,
    jsonLdTypes: null,
    invalidJsonLd: null,
    wordCount: null,
    internalLinks: null,
    externalLinks: null,
    images: null,
    imagesMissingAlt: null,
    hasFaqMarkup: null,
    articleDatePublished: null,
    preferredSourcesLink: null,
    questionHeadings: null,
    conciseAnswers: null,
  };
}

const pagesOf = (list: CrawledPage[]) => new Map(list.map((p) => [p.finalUrl, p]));
const noReferrers = () => [];

describe("summarisePages", () => {
  it("keeps the first 100 broken links, sorted by target then source", () => {
    const pages = pagesOf(Array.from({ length: 101 }, (_, i) => page(`/gone${pad(i)}`, 404, null)));
    // Two sources per target, given in reverse order.
    const referrersOf = (url: string) => [`${url}-from-b`, `${url}-from-a`];
    const { brokenInternalLinks } = summarisePages(pages, referrersOf);
    expect(brokenInternalLinks).toHaveLength(100);
    expect(brokenInternalLinks.slice(0, 3)).toEqual([
      { from: `${origin}/gone000-from-a`, to: `${origin}/gone000`, status: 404 },
      { from: `${origin}/gone000-from-b`, to: `${origin}/gone000`, status: 404 },
      { from: `${origin}/gone001-from-a`, to: `${origin}/gone001`, status: 404 },
    ]);
    expect(brokenInternalLinks.at(-1)?.to).toBe(`${origin}/gone049`);
  });

  it("keeps the first 50 duplicate titles, sorted by title", () => {
    const list = Array.from({ length: 51 }, (_, i) => [
      page(`/t${pad(50 - i)}/a`, 200, `Title ${pad(50 - i)}`),
      page(`/t${pad(50 - i)}/b`, 200, `Title ${pad(50 - i)}`),
    ]).flat();
    const { duplicateTitles } = summarisePages(pagesOf(list), noReferrers);
    expect(duplicateTitles).toHaveLength(50);
    expect(duplicateTitles.map((d) => d.title).slice(0, 2)).toEqual(["Title 000", "Title 001"]);
    expect(duplicateTitles.at(-1)?.title).toBe("Title 049");
  });

  it("lists at most 10 URLs per duplicate title, sorted", () => {
    const list = Array.from({ length: 11 }, (_, i) => page(`/p${pad(10 - i)}`, 200, "Same"));
    const { duplicateTitles } = summarisePages(pagesOf(list), noReferrers);
    expect(duplicateTitles).toEqual([
      { title: "Same", urls: Array.from({ length: 10 }, (_, i) => `${origin}/p${pad(i)}`) },
    ]);
  });

  it("ignores titles of unsuccessful pages and averages time over every page", () => {
    const list = [page("/a", 200, "X", 10), page("/b", 500, "X", 30)];
    expect(summarisePages(pagesOf(list), noReferrers)).toMatchObject({
      pagesCrawled: 2,
      duplicateTitles: [],
      avgMs: 20,
    });
  });

  it("has no average time without pages", () => {
    expect(summarisePages(new Map(), noReferrers).avgMs).toBeNull();
  });
});

describe("sitemapPages", () => {
  const pages = pagesOf([page("/a", 200, "A"), page("/b", 404, null), page("/c", 301, null)]);

  it("counts the listed URLs that were crawled and those that answered 2xx", () => {
    const listed = ["/a", "/b", "/c", "/never-crawled"].map((path) => `${origin}${path}`);
    expect(sitemapPages(listed, pages)).toEqual({ crawled: 3, ok: 1 });
  });

  it("is null without sitemap URLs", () => {
    expect(sitemapPages(null, pages)).toBeNull();
    expect(sitemapPages([], pages)).toBeNull();
  });
});
