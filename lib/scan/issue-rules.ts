import { RETIRED_RULE_NOTES, TRAINING_ONLY_NOTE } from "@/lib/explain/rule-notes";
import { pagesNotIndexed } from "./issue-rules-indexing";
import { fewReferringSites, notNamedByAi } from "./issue-rules-outside";
import { snippetsBlocked } from "./issue-rules-snippets";
import { AI_RETRIEVAL_AGENTS } from "./robots";
import {
  count,
  crawlGap,
  htmlPagesWhere,
  pagesGap,
  type RuleDef,
  retiredRule,
  rule,
  topicPath,
} from "./rule-def";
import type { ReadinessFacts } from "./view-shapes";

export type { RuleDef } from "./rule-def";

const TECHNICAL_SEO = [topicPath("technical-seo-checklist")];
const AI_CRAWLERS = [topicPath("llms-txt-and-ai-crawlers")];
const atSite = (readiness: ReadinessFacts, path: string) => new URL(path, readiness.url).href;
const NO_READINESS = { unknown: "The readiness check recorded no usable result" };

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
      title: `${count(urls.length, "page is", "pages are")} missing a title`,
      problem: "Without a title, search results and AI answers have nothing to call these pages.",
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
      title: `${count(urls.length, "page has", "pages have")} no summary for search results`,
      problem:
        "Without a short summary written for them, Google picks a snippet from the page text.",
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
      title: `${count(locations.length, "page you link to", "pages you link to")} can't be found`,
      problem:
        "Links on your site lead to pages that are gone or show an error, so visitors and Google hit dead ends.",
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
      problem: "These pages ask search engines not to list them, so they can't be found on Google.",
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
    // Blocking only training crawlers is a policy choice (formula v3): nothing to raise.
    if (!blocked.some((name) => AI_RETRIEVAL_AGENTS.has(name))) {
      return blocked.length > 0 ? { clear: TRAINING_ONLY_NOTE } : "clear";
    }
    return {
      area: "GEO",
      impact: "high",
      title: "AI assistants can't read your site",
      problem:
        "AI assistants' search tools are blocked from reading your site, so they can't cite it.",
      fix: `Allow the AI search agents (${[...AI_RETRIEVAL_AGENTS].join(", ")}) in robots.txt; blocking training-only crawlers is your choice.`,
      check: "robots.txt lets each AI search agent fetch /.",
      locations: [atSite(readiness, "/robots.txt")],
    };
  },
);

// Formula v3 retired these: Google ended FAQ results in May 2026 and says llms.txt neither helps
// nor harms. They stay in RULES so the normal sync closes their open actions with the reason.
const noFaqSchema = retiredRule("no-faq-schema", RETIRED_RULE_NOTES["no-faq-schema"]);
const noLlmsTxt = retiredRule("no-llms-txt", RETIRED_RULE_NOTES["no-llms-txt"]);

const noPreferredSources = rule(
  {
    id: "no-preferred-sources",
    needs: ["crawler", "readiness"],
    effort: "small",
    docs: [topicPath("google-preferred-sources")],
  },
  ({ readiness, productKind }) => {
    // A Top Stories feature: for any other site the rule never applies, and a clear outcome lets
    // the normal sync resolve an action raised before formula v2.
    if (productKind !== "news") return "clear";
    if (!readiness) return NO_READINESS;
    const sources = readiness.preferredSources;
    if (!sources) return { unknown: "The Preferred Sources check had no pages to read" };
    if (sources.button) return "clear";
    return {
      area: "AEO",
      impact: "low",
      title: "No favourite-source link for Google readers",
      problem: "Readers can't pick your site as a favourite source in Google's Top Stories.",
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
  snippetsBlocked,
  aiCrawlersBlocked,
  noFaqSchema,
  noLlmsTxt,
  noPreferredSources,
  pagesNotIndexed,
  fewReferringSites,
  notNamedByAi,
];
