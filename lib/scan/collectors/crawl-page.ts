import { blocksSnippets, extractPage, hasNoindex, type PageFacts } from "../html";
import type { SafeFetchResponse } from "../types";

type HtmlFields = Omit<PageFacts, "links">;

/**
 * The `page` observation (subject: the requested URL): the response, plus what its HTML says
 * (see PageFacts, without `links`). Pages without HTML to read (non-2xx statuses, other content
 * types) record every HTML field as null — a gap, not a zero. `noindex` and `noSnippet` here
 * also count the X-Robots-Tag header.
 */
export type CrawledPage = {
  /** HTTP status of the final response. */
  status: number;
  /** URL after redirects. */
  finalUrl: string;
  /** Request time in ms, redirects included. */
  ms: number;
  /** The body passed the 2 MiB cap, so the HTML facts describe only its start. */
  truncated: boolean;
} & { [K in keyof HtmlFields]: HtmlFields[K] | null };

const NO_HTML: { [K in keyof HtmlFields]: null } = {
  title: null,
  titleLength: null,
  metaDescription: null,
  descriptionLength: null,
  h1Count: null,
  canonical: null,
  robotsMeta: null,
  noindex: null,
  noSnippet: null,
  nosnippetWords: null,
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

function isHtml(headers: Record<string, string>): boolean {
  const type = headers["content-type"];
  return type === undefined || /html/i.test(type);
}

/** The page observation for a response, and the internal links to crawl next. */
export function pageFromResponse(response: SafeFetchResponse): {
  page: CrawledPage;
  links: string[];
} {
  const { status, finalUrl, truncated, headers } = response;
  const base = { status, finalUrl, ms: Math.round(response.ms), truncated };
  if (status < 200 || status >= 300 || !isHtml(headers)) {
    return { page: { ...base, ...NO_HTML }, links: [] };
  }
  const { links, ...facts } = extractPage(response.body, finalUrl);
  const robotsHeaders = response.headerLines.filter(([name]) => name === "x-robots-tag");
  const header = (test: (value: string) => boolean) => robotsHeaders.some(([, v]) => test(v));
  const noindex = facts.noindex || header(hasNoindex);
  const noSnippet = facts.noSnippet || header(blocksSnippets);
  return { page: { ...base, ...facts, noindex, noSnippet }, links };
}
