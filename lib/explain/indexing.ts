import type { FourParts } from "@/lib/explain/four-parts";
import type { IndexState } from "@/lib/scan/index-shapes";

// What "is Google indexing my pages?" says in plain words: the action text and the product page.
// Google's own state names stay in Technical details.

/** The action the `pages-not-indexed` rule raises. `checked` is how many pages had a status. */
export function pagesNotIndexedText(missing: number, checked: number) {
  return {
    title: `Google hasn't added ${missing} of your ${checked} pages to its search results`,
    problem:
      "Pages Google hasn't added to its search results can't be found there, however good they are.",
    fix:
      "Make each page clearly different and useful on its own, put the real content in the page " +
      "itself (not loaded afterwards), link to the page from your other pages, and earn links " +
      "from other sites.",
    check: "The number of pages Google hasn't added falls at the next checks.",
  };
}

/** Why the rule can't judge yet. */
export const INDEXING_UNKNOWN = {
  none: "Google hasn't been asked about any of your pages yet",
  tooNew: "Your sitemap is less than 14 days old in Harbour's records: new pages need time",
} as const;

/** Said wherever Search Console is described, so the page check is never a surprise. */
export const ALSO_CHECKS_INDEX = "It also checks which pages Google has indexed.";

/** One sentence under the line, always visible. */
export const INDEXING_ONE_LINER =
  "How many of your pages Google has added to its search results. Pages it hasn't added can't be found there.";

/** The four parts behind "What's this?". */
export const INDEXING_PARTS: FourParts = {
  what: "The number of pages in your sitemap that Google has added to its search results. Harbour asks Google about up to 100 pages a day.",
  why: "A page Google hasn't added can't appear in search, so nobody finds it however good it is.",
  todo: "If many pages are missing, make each one clearly different and useful, link to it from your other pages and earn links from other sites. New pages can take a few weeks.",
  worth: "Pages Google has added are the ones that can bring visitors from search.",
};

/** The plain name of each state, for the breakdown inside Technical details. */
export const INDEX_STATE_NAMES: Readonly<Record<IndexState, string>> = {
  indexed: "In Google",
  discovered_not_indexed: "Found, not added yet",
  crawled_not_indexed: "Read, not added",
  unknown_to_google: "Google doesn't know the page",
  blocked: "Blocked from Google",
  other: "Something else",
  unknown: "Couldn't be checked",
};

/** What the line says when there is a count. */
export const inGoogleLine = (indexed: number, total: number) =>
  `In Google: ${indexed} of ${total} ${total === 1 ? "page" : "pages"}`;

/** What the indexing check records when it does not run; the product page tells these apart. */
export const INDEXING_REASONS = {
  crawlerFailed: "The crawler did not run ok, so there are no sitemap pages to check",
  noSitemap: "No sitemap pages were recorded, so there is nothing to check",
  notCovered:
    "The Search Console property doesn't cover this site's address. Use the domain property " +
    "(sc-domain:…) or the property for the exact address.",
} as const;

/** Why there is no count, in a sentence that says what happened and what to do. */
export const INDEXING_EMPTY = {
  notConnected:
    "Search Console isn't connected, so Harbour can't see which pages Google has added.",
  notCovered:
    "The Search Console property doesn't cover this site's address. Use the domain property or the property for the exact address.",
  crawlerFailed:
    "Harbour couldn't read your site in the last check, so it has no pages to ask Google about. It will try again.",
  noSitemap: "Harbour found no sitemap pages to check.",
  failed: "Google didn't answer the page checks in the last check. Harbour will try again.",
  quota: "Google's daily limit was reached; the check continues tomorrow.",
  noAnswer: "Google hasn't answered about any page yet.",
  waiting: "Not checked yet: it starts with the next check.",
} as const;

/** The line while a large site is still being worked through. */
export const checkingLine = (asked: number, total: number) =>
  `Checking, ${asked} of ${total} so far`;

/** Pages Google could not answer about, shown beside the count. */
export const couldntCheckLine = (unknown: number) =>
  `${unknown} ${unknown === 1 ? "page" : "pages"} couldn't be checked yet.`;
