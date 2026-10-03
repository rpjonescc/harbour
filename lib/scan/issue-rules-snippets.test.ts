import { ALL_OK, crawlSite, htmlPage } from "@/tests/helpers/scoring";
import { evaluateRules } from "./issues";
import { pageRows } from "./page-rows";
import type { CollectorStatus, ScanObservation } from "./types";

const RULE = "snippets-blocked";
const at = (path: string) => `https://docs.example.com${path}`;
const outcome = (
  observations: ScanObservation[],
  statuses: Record<string, CollectorStatus> = ALL_OK,
) =>
  evaluateRules(
    [crawlSite({ brokenInternalLinks: [] }), ...observations],
    statuses,
    "product",
  ).find((o) => o.ruleId === RULE);
const quiet = (path: string, value: Record<string, unknown> = {}) =>
  htmlPage(path, { noSnippet: true, ...value });

describe("rule snippets-blocked", () => {
  it("is raised for an indexable page with nosnippet, as a medium AEO action in plain words", () => {
    const result = outcome([htmlPage("/"), quiet("/guide")]);
    expect(result?.state).toBe("present");
    if (result?.state !== "present") return;
    expect(result.issue).toMatchObject({
      id: RULE,
      area: "AEO",
      impact: "medium",
      effort: "small",
      title: "Google can't quote this page",
      problem:
        "These pages can be found on Google, but they tell Google not to quote their text, so " +
        "they can't appear as an answer in Google's results, AI Overviews or AI Mode.",
      locations: [`${at("/guide")} (nosnippet or max-snippet:0)`],
      total: 1,
      docs: ["research/aeo/aeo-and-ai-overviews.md"],
    });
  });

  it("leaves out pages the site already hides from search", () => {
    expect(outcome([htmlPage("/"), quiet("/private", { noindex: true })])?.state).toBe("clear");
  });

  it("counts a page whose text is mostly inside data-nosnippet, not a small notice", () => {
    const mostly = htmlPage("/mostly", { wordCount: 300, nosnippetWords: 150 });
    const notice = htmlPage("/notice", { wordCount: 300, nosnippetWords: 40 });
    const result = outcome([mostly, notice]);
    if (result?.state !== "present") throw new Error("expected present");
    expect(result.issue.locations).toEqual([
      `${at("/mostly")} (most of its text inside data-nosnippet)`,
    ]);
  });

  it("lists up to 5 URLs with the full count", () => {
    const pages = Array.from({ length: 7 }, (_, i) => quiet(`/p${i}`));
    const result = outcome(pages);
    if (result?.state !== "present") throw new Error("expected present");
    expect(result.issue.title).toBe("Google can't quote these 7 pages");
    expect(result.issue.locations).toHaveLength(5);
    expect(result.issue.total).toBe(7);
  });

  it("is clear when every page can be quoted", () => {
    expect(outcome([htmlPage("/"), htmlPage("/a")])?.state).toBe("clear");
  });

  it("is unknown for pages crawled before snippet settings were recorded", () => {
    const old = htmlPage("/");
    const { noSnippet: _, nosnippetWords: __, ...value } = old.value as Record<string, unknown>;
    expect(outcome([{ ...old, value }])).toMatchObject({ state: "unknown" });
  });

  it("is unknown when the crawler did not run ok", () => {
    expect(outcome([quiet("/")], { ...ALL_OK, crawler: "failed" })?.state).toBe("unknown");
  });

  it("shows on the page's row in the Pages table", () => {
    const { rows } = pageRows([quiet("/guide"), quiet("/hidden", { noindex: true })]);
    expect(rows.map((r) => [r.url, r.problems])).toEqual([
      [at("/guide"), ["Google can't quote it"]],
      [at("/hidden"), ["Hidden from search"]],
    ]);
  });
});
