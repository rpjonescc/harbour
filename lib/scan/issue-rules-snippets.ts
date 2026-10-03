import { SNIPPET_REASONS, SNIPPETS_UNKNOWN, snippetsBlockedText } from "@/lib/explain/snippets";
import { pagesGap, type RuleDef, rule, topicPath } from "./rule-def";
import { snippetBlock, snippetsKnown } from "./snippets";
import { isHtmlPage } from "./view-shapes";

/** Five example URLs are enough to act on; the title and evidence give the full count. */
const MAX_EXAMPLES = 5;

/**
 * Raised when pages meant to be found (indexable: not noindex) stop Google quoting them, which
 * keeps them out of answers. No score change: it is an eligibility check.
 */
export const snippetsBlocked: RuleDef = rule(
  {
    id: "snippets-blocked",
    needs: ["crawler"],
    effort: "small",
    docs: [topicPath("aeo-and-ai-overviews")],
    maxLocations: MAX_EXAMPLES,
  },
  ({ pages }) => {
    const judged = pages.filter((p) => isHtmlPage(p) && snippetsKnown(p));
    if (judged.length === 0) return { unknown: SNIPPETS_UNKNOWN };
    const locations = judged.flatMap((page) => {
      const block = page.noindex === true ? null : snippetBlock(page);
      return block ? [`${page.url} (${SNIPPET_REASONS[block]})`] : [];
    });
    return {
      area: "AEO",
      impact: "medium",
      ...snippetsBlockedText(locations.length),
      locations,
    };
  },
  pagesGap,
);
