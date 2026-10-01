import type { Observation } from "../types";
import { readCrawl } from "./readiness-crawl";

const origin = "https://news.example.com";
const now = new Date("2026-10-01T06:00:00Z");

type PageFields = {
  jsonLdTypes?: string[] | null;
  hasFaqMarkup?: boolean | null;
  articleDatePublished?: string | null;
  preferredSourcesLink?: boolean | null;
  finalPath?: string;
  status?: number;
};

function page(path: string, fields: PageFields = {}): Observation {
  const { finalPath = path, status = 200, ...facts } = fields;
  return {
    kind: "page",
    subject: `${origin}${path}`,
    value: {
      status,
      finalUrl: `${origin}${finalPath}`,
      jsonLdTypes: [],
      hasFaqMarkup: false,
      articleDatePublished: null,
      preferredSourcesLink: false,
      ...facts,
    },
  };
}

function site(fields: Record<string, unknown> = {}): Observation {
  return {
    kind: "site",
    subject: `${origin}/`,
    value: {
      pagesCrawled: 1,
      pagesInSitemap: 3,
      sitemapsRead: 1,
      sitemapErrors: [],
      sitemapLastmods: { dated: 0, newest: [] },
      ...fields,
    },
  };
}

const noLog = () => {};

const NO_HTML = {
  jsonLdTypes: null,
  hasFaqMarkup: null,
  articleDatePublished: null,
  preferredSourcesLink: null,
};

describe("readCrawl sitemap", () => {
  it("reports a complete sitemap with its lastmod freshness", () => {
    const lastmods = {
      dated: 3,
      newest: [
        { url: `${origin}/a`, lastmod: "2026-09-30T00:00:00.000Z" },
        { url: `${origin}/b`, lastmod: "2026-09-02T00:00:00.000Z" },
        { url: `${origin}/c`, lastmod: "2026-08-31T00:00:00.000Z" },
      ],
    };
    const { sitemap } = readCrawl([site({ sitemapLastmods: lastmods })], now, noLog);
    expect(sitemap).toEqual({
      reachable: true,
      valid: true,
      sitemapsRead: 1,
      urlCount: 3,
      partial: false,
      errors: [],
      offOrigin: [],
      datedUrls: 3,
      newestLastmod: "2026-09-30T00:00:00.000Z",
      modifiedLast30Days: 2,
    });
  });

  it("marks the count partial when some sitemaps failed and lists off-origin ones", () => {
    const errors = [
      { url: "https://example.com/sitemap.xml", kind: "off_origin" },
      { url: `${origin}/broken.xml`, status: 500 },
    ];
    const { sitemap } = readCrawl([site({ sitemapErrors: errors })], now, noLog);
    expect(sitemap).toMatchObject({
      urlCount: 3,
      partial: true,
      valid: true,
      errors,
      offOrigin: ["https://example.com/sitemap.xml"],
    });
  });

  it("reports an unreadable sitemap as unreachable with an unknown count", () => {
    const errors = [{ url: `${origin}/sitemap.xml`, kind: "invalid" }];
    const value = { pagesInSitemap: null, sitemapsRead: 0, sitemapErrors: errors };
    const { sitemap } = readCrawl([site({ ...value, sitemapLastmods: null })], now, noLog);
    expect(sitemap).toMatchObject({
      reachable: false,
      valid: false,
      urlCount: null,
      partial: false,
      datedUrls: null,
      newestLastmod: null,
      modifiedLast30Days: null,
    });
  });

  it("has no validity verdict when the site has no sitemap at all", () => {
    const value = { pagesInSitemap: 0, sitemapsRead: 0 };
    const { sitemap } = readCrawl([site(value)], now, noLog);
    expect(sitemap).toMatchObject({ reachable: false, valid: null, urlCount: 0 });
  });
});

describe("readCrawl schema", () => {
  it("counts distinct HTML pages per schema family, subtypes included", () => {
    const pages = [
      page("/", { jsonLdTypes: ["Organization", "WebSite"] }),
      page("/home", { finalPath: "/", jsonLdTypes: ["Organization", "WebSite"] }),
      page("/shop", { jsonLdTypes: ["Store"] }),
      page("/faq", { hasFaqMarkup: true }),
      page("/cake", { jsonLdTypes: ["Recipe"] }),
      page("/post", { jsonLdTypes: ["BlogPosting"] }),
      page("/gone", { status: 404, ...NO_HTML }),
    ];
    expect(readCrawl([site(), ...pages], now, noLog).schema).toEqual({
      pagesChecked: 5,
      pagesWith: {
        Organization: 2,
        WebSite: 1,
        LocalBusiness: 1,
        FAQPage: 1,
        HowTo: 1,
        Article: 1,
      },
    });
  });
});

describe("readCrawl Preferred Sources", () => {
  it("finds the button and counts fresh URLs from sitemap dates and article dates", () => {
    const lastmods = {
      dated: 2,
      newest: [
        { url: `${origin}/a`, lastmod: "2026-09-30T00:00:00.000Z" },
        { url: `${origin}/b`, lastmod: "2026-09-29T00:00:00.000Z" },
      ],
    };
    const pages = [
      page("/", { preferredSourcesLink: true }),
      page("/a", { articleDatePublished: "2026-09-20T00:00:00.000Z" }),
      page("/c", { articleDatePublished: "2026-09-25T00:00:00.000Z" }),
      page("/old", { articleDatePublished: "2026-07-01T00:00:00.000Z" }),
      page("/future", { articleDatePublished: "2027-01-01T00:00:00.000Z" }),
    ];
    const { preferredSources } = readCrawl(
      [site({ sitemapLastmods: lastmods }), ...pages],
      now,
      noLog,
    );
    expect(preferredSources).toEqual({
      button: true,
      buttonPages: [`${origin}/`],
      freshUrls: 3,
      freshContent: true,
    });
  });

  it("has no fresh content below three URLs", () => {
    const pages = [page("/a", { articleDatePublished: "2026-09-30T00:00:00.000Z" })];
    expect(readCrawl([site(), ...pages], now, noLog).preferredSources).toEqual({
      button: false,
      buttonPages: [],
      freshUrls: 1,
      freshContent: false,
    });
  });
});

describe("readCrawl without a crawl", () => {
  it("reports every crawl-based section as unknown when there is no site observation", () => {
    expect(readCrawl([], now, noLog)).toEqual({
      sitemap: null,
      schema: null,
      preferredSources: null,
    });
  });

  it("reports crawl-based parts as unknown, and says why, when the shape is unexpected", () => {
    const logs: string[] = [];
    const log = (line: string) => logs.push(line);
    const unknown = { sitemap: null, schema: null, preferredSources: null };
    expect(readCrawl([site({ sitemapsRead: "three" })], now, log)).toEqual(unknown);
    const badPage = { kind: "page", subject: `${origin}/x`, value: { status: 200 } };
    expect(readCrawl([site(), badPage], now, log)).toEqual(unknown);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatch(/^crawler observations have an unexpected shape \(sitemapsRead/);
  });
});
