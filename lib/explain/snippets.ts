// The action raised when Google can't quote pages meant to be found: what happened, whether it
// matters and what to do, in plain words. The fix and check sit under Technical details.

/** The action `snippets-blocked` raises for `n` pages. */
export function snippetsBlockedText(n: number) {
  return {
    title: n === 1 ? "Google can't quote this page" : `Google can't quote these ${n} pages`,
    problem:
      "These pages can be found on Google, but they tell Google not to quote their text, so " +
      "they can't appear as an answer in Google's results, AI Overviews or AI Mode.",
    fix:
      "On each page you want quoted, remove nosnippet and max-snippet:0 from the robots meta " +
      "tag and the X-Robots-Tag header, and keep data-nosnippet for small parts such as a " +
      "cookie notice.",
    check:
      "Each listed page serves no nosnippet or max-snippet:0, and less than half of its text " +
      "is inside data-nosnippet.",
  };
}

/** Why a page is listed, beside its URL under Technical details. */
export const SNIPPET_REASONS = {
  directive: "nosnippet or max-snippet:0",
  "hidden-text": "most of its text inside data-nosnippet",
} as const;

/** Why the rule can't judge yet. */
export const SNIPPETS_UNKNOWN = "No crawled page recorded its snippet settings";
