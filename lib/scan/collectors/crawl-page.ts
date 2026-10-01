import { extractPage, hasNoindex, type PageFacts } from "../html";
import type { SafeFetchResponse } from "../types";

type HtmlFields = Omit<PageFacts, "links">;

/**
 * The `page` observation: the response, plus what its HTML says. Pages without HTML to read
 * (error statuses, other content types) record every HTML field as null — a gap, not a zero.
 */
export type CrawledPage = {
  status: number;
  finalUrl: string;
  ms: number;
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
  lang: null,
  jsonLdTypes: null,
  invalidJsonLd: null,
  wordCount: null,
  internalLinks: null,
  externalLinks: null,
  images: null,
  imagesMissingAlt: null,
  hasFaqMarkup: null,
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
  const noindex = facts.noindex || hasNoindex(headers["x-robots-tag"] ?? "");
  return { page: { ...base, ...facts, noindex }, links };
}
