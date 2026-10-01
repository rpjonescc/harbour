import type { CrawledPage } from "./crawl-page";

export type BrokenLink = { from: string; to: string; status: number };
export type DuplicateTitle = { title: string; urls: string[] };

const MAX_BROKEN_LINKS = 100;
const MAX_DUPLICATE_TITLES = 50;
const MAX_URLS_PER_TITLE = 10;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Internal links whose target answered 4xx/5xx, per linking page, sorted and capped. */
function brokenLinks(
  pages: ReadonlyMap<string, CrawledPage>,
  referrersOf: (url: string) => readonly string[],
): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const [to, page] of pages) {
    if (page.status < 400) continue;
    for (const from of referrersOf(to)) broken.push({ from, to, status: page.status });
  }
  broken.sort((a, b) => byText(a.to, b.to) || byText(a.from, b.from));
  return broken.slice(0, MAX_BROKEN_LINKS);
}

/**
 * Titles shared by two or more distinct successful pages, sorted and capped. Pages are told
 * apart by final URL, so a redirect and its target are one page.
 */
function duplicateTitles(pages: ReadonlyMap<string, CrawledPage>): DuplicateTitle[] {
  const byTitle = new Map<string, Set<string>>();
  for (const page of pages.values()) {
    if (page.title === null || page.status < 200 || page.status >= 300) continue;
    const urls = byTitle.get(page.title) ?? new Set<string>();
    urls.add(page.finalUrl);
    byTitle.set(page.title, urls);
  }
  return [...byTitle]
    .filter(([, urls]) => urls.size > 1)
    .sort(([a], [b]) => byText(a, b))
    .slice(0, MAX_DUPLICATE_TITLES)
    .map(([title, urls]) => ({ title, urls: [...urls].sort(byText).slice(0, MAX_URLS_PER_TITLE) }));
}

/** Site-level findings over the crawled pages (keyed by requested URL). */
export function summarisePages(
  pages: ReadonlyMap<string, CrawledPage>,
  referrersOf: (url: string) => readonly string[],
) {
  const times = [...pages.values()].map((page) => page.ms);
  return {
    pagesCrawled: pages.size,
    brokenInternalLinks: brokenLinks(pages, referrersOf),
    duplicateTitles: duplicateTitles(pages),
    // No pages means no timing: a gap, not zero.
    avgMs: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
  };
}
