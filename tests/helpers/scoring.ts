/** Fixture observations for scoring tests: a fictional docs site, Acme Docs. */
import { scoreScan } from "@/lib/scan/score";
import type { CollectorStatus, ScanObservation, ScoreContext } from "@/lib/scan/types";

export const ORIGIN = "https://docs.example.com";
export const NOW = new Date("2026-10-01T06:00:00Z");

const at = (path: string) => `${ORIGIN}${path}`;

/** A 2xx HTML page that passes every technical check unless overridden. */
export function htmlPage(path: string, value: Record<string, unknown> = {}): ScanObservation {
  return {
    collector: "crawler",
    kind: "page",
    subject: at(path),
    value: {
      status: 200,
      finalUrl: at(path),
      ms: 120,
      truncated: false,
      title: "A page title of fine length",
      titleLength: 27,
      metaDescription: "A description",
      descriptionLength: 120,
      h1Count: 1,
      canonical: at(path),
      robotsMeta: null,
      noindex: false,
      lang: "en",
      jsonLdTypes: [],
      invalidJsonLd: 0,
      wordCount: 300,
      internalLinks: 4,
      externalLinks: 0,
      images: 0,
      imagesMissingAlt: 0,
      hasFaqMarkup: false,
      articleDatePublished: null,
      preferredSourcesLink: false,
      questionHeadings: 0,
      conciseAnswers: 0,
      ...value,
    },
  };
}

/** A page without HTML to read (an error status): every HTML fact null. */
export function errorPage(path: string, status: number): ScanObservation {
  const page = htmlPage(path);
  const nulls = Object.fromEntries(
    Object.keys(page.value)
      .filter((key) => !["status", "finalUrl", "ms", "truncated"].includes(key))
      .map((key) => [key, null]),
  );
  return { ...page, value: { ...page.value, ...nulls, status } };
}

export function crawlSite(value: Record<string, unknown> = {}): ScanObservation {
  return {
    collector: "crawler",
    kind: "site",
    subject: at("/"),
    value: {
      pagesCrawled: 7,
      pagesInSitemap: 5,
      sitemapLastmods: null,
      brokenInternalLinks: [
        { from: at("/"), to: at("/missing"), status: 404 },
        { from: at("/about"), to: at("/missing"), status: 404 },
      ],
      duplicateTitles: [],
      avgMs: 120,
      robotsTxt: "ok",
      sitemapsRead: 1,
      sitemapErrors: [],
      sitemapPages: { crawled: 4, ok: 3 },
      blockedByRobots: 0,
      fetchErrors: [],
      limitReached: null,
      ...value,
    },
  };
}

/**
 * Acme Docs' crawl: 7 requests, 6 distinct pages (/old redirects to /about), one 404. Each HTML
 * page fails one check: "/" a short title, /faq a short description, /blog two h1s, /about no
 * canonical and noindex.
 */
export const ACME_CRAWL: ScanObservation[] = [
  htmlPage("/", { titleLength: 9, jsonLdTypes: ["Organization", "WebSite"] }),
  htmlPage("/guides/install", { jsonLdTypes: ["HowTo"], questionHeadings: 2, conciseAnswers: 1 }),
  htmlPage("/faq", {
    descriptionLength: 20,
    jsonLdTypes: ["FAQPage"],
    hasFaqMarkup: true,
    questionHeadings: 4,
    conciseAnswers: 3,
  }),
  htmlPage("/blog/launch", { h1Count: 2 }),
  htmlPage("/about", { canonical: null, noindex: true }),
  htmlPage("/old", { finalUrl: at("/about") }),
  errorPage("/missing", 404),
  crawlSite(),
];

const ALLOWED = {
  GPTBot: "blocked",
  "OAI-SearchBot": "allowed",
  "ChatGPT-User": "allowed",
  PerplexityBot: "allowed",
  ClaudeBot: "allowed",
  "Claude-SearchBot": "allowed",
  "Google-Extended": "allowed",
  CCBot: "partial",
  Bytespider: "allowed",
};

type Parts = Record<string, Record<string, unknown> | null>;

/** Acme Docs' readiness, with parts replaced by `parts` (null for an unknown part). */
export function readiness(parts: Parts = {}): ScanObservation {
  return {
    collector: "readiness",
    kind: "readiness",
    subject: at("/"),
    value: {
      robotsTxt: { state: "ok", valid: true, googlebot: "partial", aiCrawlerAccess: ALLOWED },
      llmsTxt: { present: true, status: 200, bytes: 81, truncated: false, error: null },
      llmsFullTxt: { present: false, status: 404, bytes: null, truncated: false, error: null },
      sitemap: {
        reachable: true,
        valid: true,
        sitemapsRead: 1,
        urlCount: 5,
        partial: false,
        errors: [],
        offOrigin: [],
        datedUrls: 4,
        newestLastmod: "2026-09-25T00:00:00.000Z",
        modifiedLast30Days: 4,
      },
      schema: {
        pagesChecked: 5,
        pagesWith: {
          Organization: 1,
          WebSite: 1,
          LocalBusiness: 0,
          FAQPage: 1,
          HowTo: 1,
          Article: 0,
        },
      },
      preferredSources: {
        button: true,
        buttonPages: [at("/")],
        freshUrls: 4,
        freshContent: true,
      },
      https: { productUrlHttps: true },
      ...parts,
    },
  };
}

export function cwv(value: Record<string, unknown> = {}): ScanObservation {
  return {
    collector: "pagespeed",
    kind: "cwv",
    subject: at("/"),
    value: {
      performanceScore: 72,
      lcpMs: 2900,
      inpMs: 260,
      cls: 0.05,
      fcpMs: 1500,
      tbtMs: 300,
      fieldDataAvailable: true,
      ...value,
    },
  };
}

const gscDay = (kind: string, date: string, impressions: number): ScanObservation => ({
  collector: "search-console",
  kind,
  subject: date,
  value: { clicks: 10, impressions, ctr: 10 / impressions, position: 18 },
});

const WINDOW = { startDate: "2026-09-01", endDate: "2026-09-28" };
const PRIOR = { priorStartDate: "2026-08-04", priorEndDate: "2026-08-31" };

/** The date `offset` days after `start` (YYYY-MM-DD). */
function dayAfter(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Rows per day from the window's first day; null is a day Search Console returned no row for. */
const rows = (kind: string, start: string, days: (number | null)[]) =>
  days.flatMap((n, i) => (n === null ? [] : [gscDay(kind, dayAfter(start, i), n)]));

/** Daily impressions this window and the 28 days before (from their first days), and the summary. */
export function searchConsole(
  current: (number | null)[],
  prior: (number | null)[],
): ScanObservation[] {
  const summary = {
    ...WINDOW,
    ...PRIOR,
    days: 0,
    queries: 0,
    pages: 0,
    priorDays: 0,
    warning: null,
  };
  return [
    ...rows("gsc_daily", WINDOW.startDate, current),
    ...rows("gsc_prior_daily", PRIOR.priorStartDate, prior),
    {
      collector: "search-console",
      kind: "gsc_summary",
      subject: "sc-domain:docs.example.com",
      value: summary,
    },
  ];
}

/** `n` days of `value` impressions each. */
export const daysOf = (n: number, value: number | null): (number | null)[] =>
  Array.from({ length: n }, () => value);

/** Acme Docs' full scan: every collector ok. */
export const ACME_SCAN: ScanObservation[] = [
  ...ACME_CRAWL,
  readiness(),
  cwv(),
  ...searchConsole(daysOf(28, 59), daysOf(28, 50)),
];

export const ALL_OK: Record<string, CollectorStatus> = {
  crawler: "ok",
  readiness: "ok",
  pagespeed: "ok",
  "search-console": "ok",
};

export const CONTEXT: ScoreContext = { now: NOW, previousPagespeed: null };

/** Scores observations with the real v1 scorer; every collector ok unless `statuses` says. */
export const scoreOf = (
  observations: ScanObservation[],
  statuses: Record<string, CollectorStatus> = ALL_OK,
  context: ScoreContext = CONTEXT,
) => scoreScan(observations, statuses, context);

/** One breakdown entry of a scored scan. */
export const entryOf = (result: ReturnType<typeof scoreOf>, key: string) =>
  result?.breakdown.find((e) => e.key === key);
