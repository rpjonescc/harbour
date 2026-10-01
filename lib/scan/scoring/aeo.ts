import { hasSchemaFamily } from "../schema-types";
import type { Crawl, Readiness } from "./inputs";
import { type HtmlPage, htmlPages } from "./pages";
import {
  measured,
  missing,
  plural,
  type SubScore,
  type SubScoreSpec,
  withSources,
} from "./sub-score";

/** A quarter of pages carrying Q&A markup is full marks: most pages are not Q&A pages. */
const QA_TARGET = 0.25;
const BUTTON_POINTS = 50;
const FRESH_POINTS = 50;

function hasQaMarkup(page: HtmlPage): boolean {
  const types = page.jsonLdTypes;
  const schema = hasSchemaFamily(types, "FAQPage") || hasSchemaFamily(types, "HowTo");
  return schema || types.includes("QAPage") || page.hasFaqMarkup;
}

/** FAQ/HowTo/Q&A coverage: the share of HTML pages with that markup, against a quarter. */
export function qaCoverage(crawl: Crawl): SubScore {
  const html = htmlPages(crawl.pages);
  if (html.length === 0) return missing("No HTML pages were crawled to check");
  const marked = html.filter(hasQaMarkup).length;
  const evidence =
    `${marked} of ${html.length} HTML pages have FAQPage, HowTo or QAPage markup ` +
    "(full marks at a quarter of the pages).";
  return measured(100 * Math.min(1, marked / html.length / QA_TARGET), evidence);
}

/**
 * Concise answer blocks: the share of question-style headings followed directly by a
 * paragraph of at most 60 words. No question headings at all scores 0.
 */
export function conciseAnswers(crawl: Crawl): SubScore {
  const html = htmlPages(crawl.pages);
  if (html.length === 0) return missing("No HTML pages were crawled to check");
  const questions = html.reduce((n, page) => n + page.questionHeadings, 0);
  const answered = html.reduce((n, page) => n + page.conciseAnswers, 0);
  if (questions === 0) {
    return measured(0, `No question-style headings on ${html.length} HTML pages.`);
  }
  const evidence =
    `${answered} of ${questions} question-style headings are answered by a paragraph of at ` +
    "most 60 words right below them.";
  return measured((100 * answered) / questions, evidence);
}

/**
 * Preferred Sources readiness: 50 for a Google Preferred Sources button or deeplink on some
 * page, 50 for fresh content (3+ URLs updated or published in the last 30 days).
 */
export function preferredSources(readiness: Readiness): SubScore {
  const ready = readiness.preferredSources;
  if (!ready)
    return missing("Readiness could not read this scan's crawl: Preferred Sources unknown");
  const score = (ready.button ? BUTTON_POINTS : 0) + (ready.freshContent ? FRESH_POINTS : 0);
  const pages = ready.buttonPages.length;
  const button = ready.button
    ? `Preferred Sources button on ${pages} ${plural(pages, "page")}`
    : "No Preferred Sources button";
  const fresh = ready.freshContent ? "fresh content" : "not enough for fresh content";
  const urls = `${ready.freshUrls} ${plural(ready.freshUrls, "URL")}`;
  const evidence = `${button}; ${urls} updated in the last 30 days (${fresh}).`;
  return measured(score, evidence);
}

/** AEO sub-scores of formula v1; scored weights sum to 1. */
export const AEO_SUB_SCORES: readonly SubScoreSpec[] = [
  {
    key: "aeo.qaCoverage",
    label: "FAQ, HowTo and Q&A coverage",
    weight: 0.4,
    measure: (i) => withSources([i.crawl], qaCoverage),
  },
  {
    key: "aeo.conciseAnswers",
    label: "Concise answer blocks",
    weight: 0.35,
    measure: (i) => withSources([i.crawl], conciseAnswers),
  },
  {
    key: "aeo.preferredSources",
    label: "Preferred Sources readiness",
    weight: 0.25,
    measure: (i) =>
      withSources([i.crawl, i.readiness], (_crawl, r: Readiness) => preferredSources(r)),
  },
  {
    key: "aeo.snippets",
    label: "Featured snippets",
    weight: 0,
    measure: () => missing("Featured-snippet data not connected (it needs a rankings API key)."),
  },
];
