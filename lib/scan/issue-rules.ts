import { AI_RETRIEVAL_AGENTS } from "./robots";
import {
  count,
  crawlGap,
  htmlPagesWhere,
  pagesGap,
  type RuleDef,
  rule,
  topicPath,
} from "./rule-def";
import type { ReadinessFacts } from "./view-shapes";

export type { RuleDef } from "./rule-def";

const TECHNICAL_SEO = [topicPath("technical-seo-checklist")];
const AI_CRAWLERS = [topicPath("llms-txt-and-ai-crawlers")];
const atSite = (readiness: ReadinessFacts, path: string) => new URL(path, readiness.url).href;
const NO_READINESS = { unknown: "The readiness check recorded no usable result" };

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const missingTitle = rule(
  { id: "missing-title", needs: ["crawler"], effort: "small", docs: TECHNICAL_SEO },
  ({ pages }) => {
    const urls = htmlPagesWhere(
      pages,
      (p) => p.titleLength !== null,
      (p) => p.titleLength === 0,
      "a title",
    );
    if (!Array.isArray(urls)) return urls;
    return {
      area: "SEO",
      impact: "high",
      title: `${count(urls.length, "page has", "pages have")} no title`,
      problem: "These pages have no <title>, so search results and AI answers can't name them.",
      fix: "Give each page a unique, descriptive <title> of 10–60 characters.",
      check: "Each listed URL serves a <title> of 10–60 characters.",
      locations: urls,
    };
  },
  pagesGap,
);

const missingDescription = rule(
  { id: "missing-description", needs: ["crawler"], effort: "medium", docs: TECHNICAL_SEO },
  ({ pages }) => {
    const urls = htmlPagesWhere(
      pages,
      (p) => p.descriptionLength !== null,
      (p) => p.descriptionLength === 0,
      "a meta description",
    );
    if (!Array.isArray(urls)) return urls;
    return {
      area: "SEO",
      impact: "medium",
      title: `${count(urls.length, "page has", "pages have")} no meta description`,
      problem: "Without a meta description, search engines pick a snippet from the page text.",
      fix: "Add a meta description of 50–160 characters summarising each page.",
      check: 'Each listed URL serves a <meta name="description"> of 50–160 characters.',
      locations: urls,
    };
  },
  pagesGap,
);

const brokenLinks = rule(
  { id: "broken-links", needs: ["crawler"], effort: "medium", docs: TECHNICAL_SEO },
  ({ site }) => {
    if (!site) return { unknown: "The crawl recorded no site summary" };
    const byTarget = new Map<string, { status: number; from: string[] }>();
    for (const link of site.brokenInternalLinks) {
      const entry = byTarget.get(link.to) ?? { status: link.status, from: [] };
      entry.from.push(link.from);
      byTarget.set(link.to, entry);
    }
    const locations = [...byTarget].map(
      ([to, { status, from }]) => `${to} (HTTP ${status}), linked from ${from.join(", ")}`,
    );
    return {
      area: "SEO",
      impact: "high",
      title: `${count(locations.length, "linked page is", "linked pages are")} broken`,
      problem: "Internal links point to pages that answer with an error.",
      fix: "Fix or remove each link, or restore (or redirect) the missing page.",
      check: "Each listed target answers 2xx, or no page links to it any more.",
      locations,
    };
  },
  crawlGap,
);

const noindex = rule(
  { id: "noindex", needs: ["crawler"], effort: "small", docs: TECHNICAL_SEO },
  ({ pages }) => {
    const urls = htmlPagesWhere(
      pages,
      (p) => p.noindex !== null,
      (p) => p.noindex === true,
      "noindex",
    );
    if (!Array.isArray(urls)) return urls;
    return {
      area: "SEO",
      impact: "high",
      title: `${count(urls.length, "page is", "pages are")} hidden from search`,
      problem: "These pages carry noindex (robots meta tag or X-Robots-Tag), so search drops them.",
      fix: "Remove noindex from pages that should appear in search; leave it only on pages meant to stay hidden.",
      check:
        "Each listed URL that should be found serves no noindex in its robots meta tag or headers.",
      locations: urls,
    };
  },
  pagesGap,
);

const aiCrawlersBlocked = rule(
  { id: "ai-crawlers-blocked", needs: ["readiness"], effort: "small", docs: AI_CRAWLERS },
  ({ readiness }) => {
    if (!readiness) return NO_READINESS;
    const access = readiness.robotsTxt.aiCrawlerAccess;
    if (!access) return { unknown: "AI crawler access in robots.txt could not be read" };
    // "partial" (some paths allowed) is deliberately not blocked: the agent can still read
    // the site, and which paths to keep out is the owner's choice.
    const blocked = Object.entries(access)
      .filter(([, state]) => state === "blocked")
      .map(([name]) => name);
    const search = blocked.some((name) => AI_RETRIEVAL_AGENTS.has(name));
    return {
      area: "GEO",
      impact: search ? "high" : "low",
      title: `robots.txt blocks ${list(blocked)}`,
      problem: search
        ? "AI search agents can't read the site, so AI answers can't cite it."
        : "Training-only AI crawlers are blocked; AI search agents can still read the site.",
      fix: `Allow the AI search agents (${[...AI_RETRIEVAL_AGENTS].join(", ")}) in robots.txt; blocking training-only crawlers is your choice.`,
      check: "robots.txt lets each AI search agent fetch /.",
      locations: blocked.length > 0 ? [atSite(readiness, "/robots.txt")] : [],
    };
  },
);

const noFaqSchema = rule(
  {
    id: "no-faq-schema",
    needs: ["crawler", "readiness"],
    effort: "medium",
    docs: [topicPath("aeo-and-ai-overviews")],
  },
  ({ pages, readiness }) => {
    if (!readiness) return NO_READINESS;
    const schema = readiness.schema;
    if (!schema || schema.pagesChecked === 0) return { unknown: "No page's schema was checked" };
    if (schema.pagesWith.FAQPage > 0 || pages.some((p) => p.hasFaqMarkup === true)) return "clear";
    return {
      area: "AEO",
      impact: "medium",
      title: "No page has FAQ structured data",
      problem: "Answer engines read FAQ markup to find questions the site answers directly.",
      fix: "Add FAQPage JSON-LD to the pages that answer common questions (each question with a short answer).",
      check:
        "At least one page serves valid FAQPage JSON-LD (Google's Rich Results Test reads it).",
      locations: [readiness.url],
    };
  },
);

const noLlmsTxt = rule(
  { id: "no-llms-txt", needs: ["readiness"], effort: "small", docs: AI_CRAWLERS },
  ({ readiness }) => {
    if (!readiness) return NO_READINESS;
    const present = readiness.llmsTxt.present;
    if (present === null) return { unknown: "Whether /llms.txt exists could not be checked" };
    if (present) return "clear";
    return {
      area: "GEO",
      impact: "low",
      title: "No llms.txt",
      problem: "There is no /llms.txt guide to the site's key pages for AI assistants.",
      fix: "Publish /llms.txt: a Markdown summary of the site with links to its most useful pages.",
      check: "/llms.txt answers 200 with plain text (not an HTML page).",
      locations: [atSite(readiness, "/llms.txt")],
    };
  },
);

const noPreferredSources = rule(
  {
    id: "no-preferred-sources",
    needs: ["crawler", "readiness"],
    effort: "small",
    docs: [topicPath("google-preferred-sources")],
  },
  ({ readiness }) => {
    if (!readiness) return NO_READINESS;
    const sources = readiness.preferredSources;
    if (!sources) return { unknown: "The Preferred Sources check had no pages to read" };
    if (sources.button) return "clear";
    return {
      area: "AEO",
      impact: "low",
      title: "No Google Preferred Sources button",
      problem: "Readers can't add the site as a preferred source in Google's Top Stories.",
      fix: "Link to https://www.google.com/preferences/source?q=<your domain> from the site, e.g. as a button near recent articles.",
      check: "A page links to google.com/preferences/source with the site's domain.",
      locations: [readiness.url],
    };
  },
);

/** Every issue rule, in the order their issues are listed at equal impact. */
export const RULES: readonly RuleDef[] = [
  missingTitle,
  missingDescription,
  brokenLinks,
  noindex,
  aiCrawlersBlocked,
  noFaqSchema,
  noLlmsTxt,
  noPreferredSources,
];
