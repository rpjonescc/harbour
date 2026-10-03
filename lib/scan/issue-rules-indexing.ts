import { INDEXING_UNKNOWN, pagesNotIndexedText } from "@/lib/explain/indexing";
import { NOT_INDEXED_STATES } from "./index-shapes";
import { type RuleDef, rule, topicPath } from "./rule-def";

/** At least this many pages Google has not added, and this share of the pages it was asked about. */
const MIN_PAGES = 3;
const MIN_SHARE = 0.2;
/** New pages need time to be added: the rule waits until Harbour has known the sitemap this long. */
const MIN_SITEMAP_AGE_MS = 14 * 24 * 60 * 60_000;

/**
 * Raised when Google hasn't added a real share of the sitemap's pages (among those with a known
 * status). Unknown while nothing was checked or the sitemap is too new to judge.
 */
export const pagesNotIndexed: RuleDef = rule(
  {
    id: "pages-not-indexed",
    needs: ["indexing"],
    effort: "medium",
    docs: [topicPath("technical-seo-checklist")],
  },
  ({ coverage }) => {
    const known = coverage?.pages.filter((p) => p.state !== "unknown") ?? [];
    if (!coverage?.asOf || known.length === 0) {
      return { unknown: INDEXING_UNKNOWN.none };
    }
    const age = Date.parse(coverage.asOf) - Date.parse(coverage.summary.sitemapSeenSince);
    if (age < MIN_SITEMAP_AGE_MS) return { unknown: INDEXING_UNKNOWN.tooNew };
    const missing = known.filter((p) => NOT_INDEXED_STATES.includes(p.state));
    if (missing.length < MIN_PAGES || missing.length / known.length < MIN_SHARE) return "clear";
    return {
      area: "SEO",
      impact: "high",
      ...pagesNotIndexedText(missing.length, known.length),
      locations: missing.map((p) => p.url),
    };
  },
);
