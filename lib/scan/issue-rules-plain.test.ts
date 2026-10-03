import { coverage, times } from "@/tests/helpers/coverage";
import { ALL_OK, crawlSite, htmlPage, readiness } from "@/tests/helpers/scoring";
import { evaluateRules, type Issue } from "./issues";
import { AI_RETRIEVAL_AGENTS } from "./robots";

// What reaches the owner on the Actions board, Today and the product page: no tags, header
// names, file names or schema vocabulary. The exact wording is pinned so a change is deliberate.
const JARGON =
  /<|>|X-Robots-Tag|robots\.txt|llms\.txt|noindex|JSON-LD|schema|structured data|markup|meta |HTTP \d|crawl/i;
const SEARCH_AGENT = [...AI_RETRIEVAL_AGENTS][0] ?? "";
const TRAINING_ONLY = "CCBot";

/**
 * Every active rule fires: a bare page, a broken link, one agent blocked, no Preferred Sources
 * button. No llms.txt and no FAQ markup raise nothing since formula v3.
 */
function issuesWhenBlocked(agent: string): Issue[] {
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
  return evaluateRules(observations, ALL_OK, "news").flatMap((o) =>
    o.state === "present" ? [o.issue] : [],
  );
}
const problemsWhenBlocked = (agent: string) => issuesWhenBlocked(agent).map((i) => i.problem);
const titlesWhenBlocked = (agent: string) => issuesWhenBlocked(agent).map((i) => i.title);

const TITLE_JARGON =
  /robots\.txt|llms\.txt|noindex|meta |structured data|JSON-LD|schema|Preferred Sources|crawler|\w+Bot\b/i;

describe("rule reasons in plain words", () => {
  it("uses real fixtures: a search agent and a training-only crawler", () => {
    expect(SEARCH_AGENT).not.toBe("");
    expect(AI_RETRIEVAL_AGENTS.has(TRAINING_ONLY)).toBe(false);
  });

  it("says each reason without jargon, and raises nothing for a training crawler alone", () => {
    expect(problemsWhenBlocked(SEARCH_AGENT)).toHaveLength(6);
    expect(problemsWhenBlocked(TRAINING_ONLY)).toHaveLength(5);
    for (const agent of [SEARCH_AGENT, TRAINING_ONLY]) {
      for (const problem of problemsWhenBlocked(agent)) expect(problem).not.toMatch(JARGON);
    }
  });

  it("pins the wording", () => {
    expect(problemsWhenBlocked(SEARCH_AGENT)).toEqual([
      "Without a title, search results and AI answers have nothing to call these pages.",
      "Without a short summary written for them, Google picks a snippet from the page text.",
      "Links on your site lead to pages that are gone or show an error, so visitors and Google hit dead ends.",
      "These pages ask search engines not to list them, so they can't be found on Google.",
      "AI assistants' search tools are blocked from reading your site, so they can't cite it.",
      "Readers can't pick your site as a favourite source in Google's Top Stories.",
    ]);
  });
});

describe("rule titles in plain words", () => {
  it("titles every rule without jargon", () => {
    const titles = titlesWhenBlocked(SEARCH_AGENT);
    expect(titles).toHaveLength(6);
    for (const title of titles) expect(title).not.toMatch(TITLE_JARGON);
  });

  it("pins the titles", () => {
    expect(titlesWhenBlocked(SEARCH_AGENT)).toEqual([
      "1 page is missing a title",
      "1 page has no summary for search results",
      "1 page you link to can't be found",
      "1 page is hidden from search",
      "AI assistants can't read your site",
      "No favourite-source link for Google readers",
    ]);
  });

  it("counts in the plural", () => {
    const titles = evaluateRules(
      [htmlPage("/a", { titleLength: 0 }), htmlPage("/b", { titleLength: 0 }), crawlSite()],
      ALL_OK,
      "product",
    ).flatMap((o) => (o.state === "present" ? [o.issue.title] : []));
    expect(titles).toContain("2 pages are missing a title");
  });
});

describe("the not-indexed action in plain words", () => {
  const raised = () => {
    const observations = [
      crawlSite(),
      ...coverage([...times(3, "crawled_not_indexed"), ...times(7, "indexed")]),
    ];
    const outcome = evaluateRules(observations, ALL_OK, "product").find(
      (o) => o.ruleId === "pages-not-indexed",
    );
    if (outcome?.state !== "present") throw new Error("expected present");
    return outcome.issue;
  };

  it("pins the wording and keeps jargon and Google's state names out", () => {
    const issue = raised();
    expect(issue.title).toBe("Google hasn't added 3 of your 10 pages to its search results");
    expect(issue.problem).toBe(
      "Pages Google hasn't added to its search results can't be found there, however good they are.",
    );
    expect(issue.fix).toBe(
      "Make each page clearly different and useful on its own, put the real content in the page itself (not loaded afterwards), link to the page from your other pages, and earn links from other sites.",
    );
    expect(issue.check).toBe("The number of pages Google hasn't added falls at the next checks.");
    for (const text of [issue.title, issue.problem, issue.fix, issue.check]) {
      expect(text).not.toMatch(JARGON);
      expect(text).not.toMatch(/\bscan\b|indexed|coverage|discovered|crawled/i);
    }
  });
});
