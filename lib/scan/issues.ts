import { AI_RETRIEVAL_AGENTS } from "./robots";
import type { ScanObservation } from "./types";
import {
  crawledPages,
  crawlSiteFacts,
  isHtmlPage,
  type PageFacts,
  type ReadinessFacts,
  readinessFacts,
  type SiteFacts,
} from "./view-shapes";

export type IssueArea = "SEO" | "GEO" | "AEO";
export type Impact = "high" | "medium" | "low";

/** A problem a scan found, with what to do about it and how to tell it is fixed. */
export type Issue = {
  /** Stable rule id, e.g. "missing-title". */
  id: string;
  area: IssueArea;
  impact: Impact;
  title: string;
  problem: string;
  fix: string;
  check: string;
  /** Where it was found: URLs, some with a note; at most 20. */
  locations: string[];
  /** How many locations there are in all. */
  total: number;
};

type Facts = { pages: PageFacts[]; site: SiteFacts | null; readiness: ReadinessFacts | null };
type Rule = (facts: Facts) => Issue | null;

const MAX_LOCATIONS = 20;
const IMPACT_ORDER: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Sort comparator: high impact first. */
export const byImpact = (a: Pick<Issue, "impact">, b: Pick<Issue, "impact">) =>
  IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function issue(fields: Omit<Issue, "locations" | "total">, locations: string[]): Issue | null {
  if (locations.length === 0) return null;
  return { ...fields, locations: locations.slice(0, MAX_LOCATIONS), total: locations.length };
}

const atSite = (readiness: ReadinessFacts, path: string) => new URL(path, readiness.url).href;

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const missingTitle: Rule = ({ pages }) => {
  const urls = pages.filter((p) => isHtmlPage(p) && p.titleLength === 0).map((p) => p.url);
  return issue(
    {
      id: "missing-title",
      area: "SEO",
      impact: "high",
      title: `${count(urls.length, "page has", "pages have")} no title`,
      problem: "These pages have no <title>, so search results and AI answers can't name them.",
      fix: "Give each page a unique, descriptive <title> of 10–60 characters.",
      check: "Each listed URL serves a <title> of 10–60 characters.",
    },
    urls,
  );
};

const missingDescription: Rule = ({ pages }) => {
  const urls = pages.filter((p) => isHtmlPage(p) && p.descriptionLength === 0).map((p) => p.url);
  return issue(
    {
      id: "missing-description",
      area: "SEO",
      impact: "medium",
      title: `${count(urls.length, "page has", "pages have")} no meta description`,
      problem: "Without a meta description, search engines pick a snippet from the page text.",
      fix: "Add a meta description of 50–160 characters summarising each page.",
      check: 'Each listed URL serves a <meta name="description"> of 50–160 characters.',
    },
    urls,
  );
};

const brokenLinks: Rule = ({ site }) => {
  const byTarget = new Map<string, { status: number; from: string[] }>();
  for (const link of site?.brokenInternalLinks ?? []) {
    const entry = byTarget.get(link.to) ?? { status: link.status, from: [] };
    entry.from.push(link.from);
    byTarget.set(link.to, entry);
  }
  const locations = [...byTarget].map(
    ([to, { status, from }]) => `${to} (HTTP ${status}), linked from ${from.join(", ")}`,
  );
  return issue(
    {
      id: "broken-links",
      area: "SEO",
      impact: "high",
      title: `${count(locations.length, "linked page is", "linked pages are")} broken`,
      problem: "Internal links point to pages that answer with an error.",
      fix: "Fix or remove each link, or restore (or redirect) the missing page.",
      check: "Each listed target answers 2xx, or no page links to it any more.",
    },
    locations,
  );
};

const noindex: Rule = ({ pages }) => {
  const urls = pages.filter((p) => isHtmlPage(p) && p.noindex === true).map((p) => p.url);
  return issue(
    {
      id: "noindex",
      area: "SEO",
      impact: "high",
      title: `${count(urls.length, "page is", "pages are")} hidden from search`,
      problem: "These pages carry noindex (robots meta tag or X-Robots-Tag), so search drops them.",
      fix: "Remove noindex from pages that should appear in search; leave it only on pages meant to stay hidden.",
      check:
        "Each listed URL that should be found serves no noindex in its robots meta tag or headers.",
    },
    urls,
  );
};

const aiCrawlersBlocked: Rule = ({ readiness }) => {
  const access = readiness?.robotsTxt.aiCrawlerAccess;
  if (!readiness || !access) return null;
  const blocked = Object.entries(access)
    .filter(([, state]) => state === "blocked")
    .map(([name]) => name);
  const search = blocked.some((name) => AI_RETRIEVAL_AGENTS.has(name));
  return issue(
    {
      id: "ai-crawlers-blocked",
      area: "GEO",
      impact: search ? "high" : "low",
      title: `robots.txt blocks ${list(blocked)}`,
      problem: search
        ? "AI search agents can't read the site, so AI answers can't cite it."
        : "Training-only AI crawlers are blocked; AI search agents can still read the site.",
      fix: "Allow the AI search agents (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot) in robots.txt; blocking training-only crawlers is your choice.",
      check: "robots.txt lets each AI search agent fetch /.",
    },
    blocked.length > 0 ? [atSite(readiness, "/robots.txt")] : [],
  );
};

const noFaqSchema: Rule = ({ pages, readiness }) => {
  const schema = readiness?.schema;
  if (!readiness || !schema || schema.pagesChecked === 0) return null;
  if (schema.pagesWith.FAQPage > 0 || pages.some((p) => p.hasFaqMarkup === true)) return null;
  return issue(
    {
      id: "no-faq-schema",
      area: "AEO",
      impact: "medium",
      title: "No page has FAQ structured data",
      problem: "Answer engines read FAQ markup to find questions the site answers directly.",
      fix: "Add FAQPage JSON-LD to the pages that answer common questions (each question with a short answer).",
      check:
        "At least one page serves valid FAQPage JSON-LD (Google's Rich Results Test reads it).",
    },
    [readiness.url],
  );
};

const noLlmsTxt: Rule = ({ readiness }) =>
  readiness?.llmsTxt.present === false
    ? issue(
        {
          id: "no-llms-txt",
          area: "GEO",
          impact: "low",
          title: "No llms.txt",
          problem: "There is no /llms.txt guide to the site's key pages for AI assistants.",
          fix: "Publish /llms.txt: a Markdown summary of the site with links to its most useful pages.",
          check: "/llms.txt answers 200 with plain text (not an HTML page).",
        },
        [atSite(readiness, "/llms.txt")],
      )
    : null;

const noPreferredSources: Rule = ({ readiness }) =>
  readiness?.preferredSources?.button === false
    ? issue(
        {
          id: "no-preferred-sources",
          area: "AEO",
          impact: "low",
          title: "No Google Preferred Sources button",
          problem: "Readers can't add the site as a preferred source in Google's Top Stories.",
          fix: "Link to https://www.google.com/preferences/source?q=<your domain> from the site, e.g. as a button near recent articles.",
          check: "A page links to google.com/preferences/source with the site's domain.",
        },
        [readiness.url],
      )
    : null;

const RULES: readonly Rule[] = [
  missingTitle,
  missingDescription,
  brokenLinks,
  noindex,
  aiCrawlersBlocked,
  noFaqSchema,
  noLlmsTxt,
  noPreferredSources,
];

/** Issues found in one scan's observations, highest impact first. Pure. */
export function deriveIssues(observations: readonly ScanObservation[]): Issue[] {
  const facts: Facts = {
    pages: crawledPages(observations),
    site: crawlSiteFacts(observations),
    readiness: readinessFacts(observations),
  };
  return RULES.flatMap((rule) => rule(facts) ?? []).sort(byImpact);
}
