import { ALL_OK, crawlSite, htmlPage, readiness } from "@/tests/helpers/scoring";
import { evaluateRules } from "./issues";
import { AI_RETRIEVAL_AGENTS } from "./robots";

// What reaches the owner on the Actions board, Today and the product page: no tags, header
// names, file names or schema vocabulary. The exact wording is pinned so a change is deliberate.
const JARGON =
  /<|>|X-Robots-Tag|robots\.txt|llms\.txt|noindex|JSON-LD|schema|structured data|markup|meta |HTTP \d|crawl/i;
const SEARCH_AGENT = [...AI_RETRIEVAL_AGENTS][0] ?? "";
const TRAINING_ONLY = "CCBot";

/** Every rule fires: a bare page, a broken link, no llms.txt, no FAQ, one agent blocked. */
function problemsWhenBlocked(agent: string): string[] {
  const observations = [
    htmlPage("/", { titleLength: 0, descriptionLength: 0, noindex: true }),
    crawlSite(),
    readiness({
      robotsTxt: { state: "ok", aiCrawlerAccess: { [agent]: "blocked" } },
      llmsTxt: { present: false },
      schema: { pagesChecked: 3, pagesWith: { FAQPage: 0 } },
      preferredSources: { button: false },
    }),
  ];
  return evaluateRules(observations, ALL_OK).flatMap((o) =>
    o.state === "present" ? [o.issue.problem] : [],
  );
}

describe("rule reasons in plain words", () => {
  it("uses real fixtures: a search agent and a training-only crawler", () => {
    expect(SEARCH_AGENT).not.toBe("");
    expect(AI_RETRIEVAL_AGENTS.has(TRAINING_ONLY)).toBe(false);
  });

  it("says each reason without jargon, for the search-agent and training-only variants", () => {
    for (const agent of [SEARCH_AGENT, TRAINING_ONLY]) {
      const problems = problemsWhenBlocked(agent);
      expect(problems).toHaveLength(8);
      for (const problem of problems) expect(problem).not.toMatch(JARGON);
    }
  });

  it("pins the wording", () => {
    expect(problemsWhenBlocked(SEARCH_AGENT)).toEqual([
      "Without a title, search results and AI answers have nothing to call these pages.",
      "Without a short summary written for them, Google picks a snippet from the page text.",
      "Links on your site lead to pages that are gone or show an error, so visitors and Google hit dead ends.",
      "These pages ask search engines not to list them, so they can't be found on Google.",
      "AI assistants' search tools are blocked from reading your site, so they can't cite it.",
      "Your pages don't label their questions and answers in a way Google and AI assistants can read, so they're less likely to quote you.",
      "There's no short guide to your site written for AI assistants, so they have to guess which pages matter.",
      "Readers can't pick your site as a favourite source in Google's Top Stories.",
    ]);
    expect(problemsWhenBlocked(TRAINING_ONLY)[4]).toBe(
      "Only the tools that collect training data are blocked; AI assistants can still read and cite your site.",
    );
  });
});
