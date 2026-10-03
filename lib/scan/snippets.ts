import type { PageFacts } from "./view-shapes";

/**
 * Why Google can't quote a crawled page, or null when it can or it is not known: the page says
 * nosnippet or max-snippet:0 ("directive"), or at least half its visible words sit inside
 * data-nosnippet ("hidden-text"). A little data-nosnippet (a cookie notice, legal text) is the
 * owner's choice and not counted.
 */
export function snippetBlock(page: PageFacts): "directive" | "hidden-text" | null {
  if (page.noSnippet === true) return "directive";
  const { wordCount, nosnippetWords } = page;
  if (wordCount == null || nosnippetWords == null || wordCount === 0) return null;
  return nosnippetWords * 2 >= wordCount ? "hidden-text" : null;
}

/** Whether the page's snippet settings were recorded, so the rule can judge it. */
export const snippetsKnown = (page: PageFacts) => page.noSnippet != null;
