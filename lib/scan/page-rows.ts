import type { ScanObservation } from "./types";
import { crawledPages, isHtmlPage, type PageFacts } from "./view-shapes";

/** One crawled page as the Pages table shows it. */
export type PageRow = { url: string; status: number; title: string | null; problems: string[] };

const MAX_ROWS = 50;

function problemsOf(page: PageFacts): string[] {
  if (page.status >= 400) return ["Didn't load"];
  if (!isHtmlPage(page)) return [];
  const problems: string[] = [];
  if (page.titleLength === 0) problems.push("Missing title");
  if (page.descriptionLength === 0) problems.push("Missing description");
  if (page.h1Count === 0) problems.push("No main heading");
  if (page.h1Count !== null && page.h1Count > 1) problems.push(`${page.h1Count} main headings`);
  if (page.noindex) problems.push("Hidden from search");
  return problems;
}

/** The crawl's pages (once each by final URL), most problems first, then by URL; at most 50. */
export function pageRows(observations: readonly ScanObservation[]): {
  rows: PageRow[];
  total: number;
} {
  const rows = crawledPages(observations).map((page) => ({
    url: page.url,
    status: page.status,
    title: page.title,
    problems: problemsOf(page),
  }));
  rows.sort(
    (a, b) => b.problems.length - a.problems.length || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  );
  return { rows: rows.slice(0, MAX_ROWS), total: rows.length };
}
