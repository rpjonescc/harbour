import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import type { ProductKind } from "@/lib/products/catalog";
import type { Effort, Issue } from "./issues";
import { isHtmlPage, type PageFacts, type ReadinessFacts, type SiteFacts } from "./view-shapes";

// The rule framework: what rules judge, how a rule is built, and when its facts may be incomplete.
// The rules themselves live in issue-rules.ts.

/** What the rules judge: one scan's facts, each null (or empty) when it was not observed. */
export type Facts = {
  pages: PageFacts[];
  /** Crawler page records that could not be read (and so were not judged). */
  unreadablePages: number;
  site: SiteFacts | null;
  readiness: ReadinessFacts | null;
  /** "news" sites are the only ones Preferred Sources applies to. */
  productKind: ProductKind;
};

/** A collector a rule depends on: it must have run ok in the scan for the rule to judge. */
export type Need = "crawler" | "readiness";

/** One issue rule: what it needs, what fixing it takes, what to read, and how it judges a scan. */
export type RuleDef = {
  id: string;
  needs: readonly Need[];
  effort: Effort;
  /** Brain paths of the research topics that explain the fix. */
  docs: readonly string[];
  evaluate(facts: Facts): Issue | "clear" | { unknown: string };
};

type Finding = Omit<Issue, "id" | "effort" | "docs" | "locations" | "total"> & {
  locations: string[];
};
type Check = (facts: Facts) => Finding | "clear" | { unknown: string };
/** Why the facts a rule judged may be incomplete, or null when they cover what it needs. */
type Gap = (facts: Facts) => string | null;

const MAX_LOCATIONS = 20;

/** A research topic's brain path; throws at load so a renamed topic fails the build. */
export function topicPath(id: string): string {
  const topic = RESEARCH_TOPICS.find((t) => t.id === id);
  if (!topic) throw new Error(`Unknown research topic: ${id}`);
  return topic.path;
}

/**
 * A rule from its metadata and check; a finding with no locations means nothing is wrong. With
 * `gap`, a clear outcome becomes unknown when the facts may be incomplete: clear resolves the
 * owner's action, while a problem found on the pages that were crawled is real either way.
 */
export function rule(meta: Omit<RuleDef, "evaluate">, check: Check, gap?: Gap): RuleDef {
  const clear = (facts: Facts) => {
    const reason = gap?.(facts);
    return reason ? { unknown: reason } : "clear";
  };
  return {
    ...meta,
    evaluate(facts) {
      const result = check(facts);
      if (result === "clear") return clear(facts);
      if ("unknown" in result) return result;
      const { locations, ...fields } = result;
      if (locations.length === 0) return clear(facts);
      return {
        id: meta.id,
        ...fields,
        effort: meta.effort,
        docs: [...meta.docs],
        locations: locations.slice(0, MAX_LOCATIONS),
        total: locations.length,
      };
    },
  };
}

export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const NO_HTML = { unknown: "No HTML pages were crawled" };

/**
 * The crawl may have missed links or pages: it stopped at a budget or some URLs gave no response.
 * URLs robots.txt kept it out of are not a gap: the owner chose to hide them from crawlers.
 */
export const crawlGap: Gap = ({ site }) => {
  if (!site) return "The crawl recorded no site summary";
  if (site.limitReached) return `Crawl stopped at the ${site.limitReached} limit`;
  if (site.fetchErrors > 0)
    return `${count(site.fetchErrors, "page", "pages")} could not be fetched`;
  return null;
};

/** As `crawlGap`, and some crawled page records could not be read. */
export const pagesGap: Gap = (facts) =>
  crawlGap(facts) ??
  (facts.unreadablePages > 0
    ? `${count(facts.unreadablePages, "page record", "page records")} unreadable`
    : null);

/**
 * URLs of the crawled HTML pages matching `test`, judged only over pages whose field is known;
 * unknown when no HTML page was crawled or none reported the field.
 */
export function htmlPagesWhere(
  pages: PageFacts[],
  known: (page: PageFacts) => boolean,
  test: (page: PageFacts) => boolean,
  what: string,
) {
  const html = pages.filter(isHtmlPage);
  if (html.length === 0) return NO_HTML;
  const judged = html.filter(known);
  if (judged.length === 0) return { unknown: `No crawled page could be checked for ${what}` };
  return judged.filter(test).map((p) => p.url);
}
