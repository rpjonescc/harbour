import type { CrawledPage } from "./inputs";

/** A crawled page whose HTML was read: every HTML fact is present. */
export type HtmlPage = CrawledPage & {
  titleLength: number;
  descriptionLength: number;
  h1Count: number;
  noindex: boolean;
  jsonLdTypes: string[];
  hasFaqMarkup: boolean;
  questionHeadings: number;
  conciseAnswers: number;
};

/** Pages counted once by final URL: a redirect and its target are one page. */
export function distinctPages(pages: readonly CrawledPage[]): CrawledPage[] {
  const byUrl = new Map<string, CrawledPage>();
  for (const page of pages) if (!byUrl.has(page.finalUrl)) byUrl.set(page.finalUrl, page);
  return [...byUrl.values()];
}

function isHtml(page: CrawledPage): page is HtmlPage {
  return (
    page.status >= 200 &&
    page.status < 300 &&
    page.titleLength !== null &&
    page.descriptionLength !== null &&
    page.h1Count !== null &&
    page.noindex !== null &&
    page.jsonLdTypes !== null &&
    page.hasFaqMarkup !== null &&
    page.questionHeadings !== null &&
    page.conciseAnswers !== null
  );
}

/** Distinct pages that answered 2xx with HTML the crawler read. */
export function htmlPages(pages: readonly CrawledPage[]): HtmlPage[] {
  return distinctPages(pages).filter(isHtml);
}
