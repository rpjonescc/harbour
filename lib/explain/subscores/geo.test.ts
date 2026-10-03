import { GEO_SUB_SCORES } from "@/lib/scan/scoring/geo";
import type { ScanObservation } from "@/lib/scan/types";
import { ACME_SCAN, entryOf, readiness, scoreOf } from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { aiEnginesLine, GEO_EXPLANATIONS } from "./geo";

function explanation(key: string) {
  const found = GEO_EXPLANATIONS.find((e) => e.key === key);
  if (!found) throw new Error(`No explanation for ${key}`);
  return found;
}
const lineOf = (observations: ScanObservation[], key: string) =>
  explanation(key).summarise(entryOf(scoreOf(observations), key)?.evidence ?? "");
const withReadiness = (parts: Parameters<typeof readiness>[0]) => [
  ...ACME_SCAN.filter((o) => o.collector !== "readiness"),
  readiness(parts),
];
const schema = (organization: number, website: number) =>
  withReadiness({
    schema: {
      pagesChecked: 5,
      pagesWith: {
        Organization: organization,
        WebSite: website,
        LocalBusiness: 0,
        FAQPage: 1,
        HowTo: 1,
        Article: 0,
      },
    },
  });

describe("GEO explanations", () => {
  it("explain every GEO sub-score of the current formula, in formula order and in full", () => {
    expect(GEO_EXPLANATIONS.map((e) => e.key)).toEqual(GEO_SUB_SCORES.map((s) => s.key));
    for (const e of GEO_EXPLANATIONS) {
      expect(e.name.trim()).not.toBe("");
      expect(isComplete(e.parts)).toBe(true);
    }
  });

  it.each([
    [
      "geo.aiCrawlers",
      "4 of the 4 AI crawlers that fetch pages to answer people's questions may read your site. " +
        "Training crawlers aren't counted: blocking them is your choice.",
    ],
    ["geo.llmsTxt", "Your site has an llms.txt guide for AI assistants."],
    ["geo.entities", "Your site tells machines who runs it and what it's called."],
    ["geo.citations", "2 of 5 pages are set out so AI assistants can quote them easily."],
  ])("read %s's real evidence in plain words", (key, line) => {
    expect(lineOf(ACME_SCAN, key)).toBe(line);
  });

  it("say when there is no llms.txt", () => {
    const scan = withReadiness({
      llmsTxt: { present: false, status: 404, bytes: null, truncated: false, error: null },
    });
    expect(lineOf(scan, "geo.llmsTxt")).toBe(
      "Your site doesn't have an llms.txt guide for AI assistants yet.",
    );
  });

  it.each([
    [0, 0, "Your site doesn't yet tell machines who runs it."],
    [1, 0, "Your site says who runs it, but not what the site is called."],
    [0, 1, "Your site gives its name, but not who runs it."],
  ])("read Organization %d and WebSite %d", (organization, website, line) => {
    expect(lineOf(schema(organization, website), "geo.entities")).toBe(line);
  });

  it("still read formula v2's crawler and citation evidence", () => {
    const crawlers =
      "8 of 9 AI crawlers may fetch the home page: 4 of 4 search and retrieval agents, " +
      "4 of 5 training crawlers; blocked: GPTBot (training only).";
    expect(explanation("geo.aiCrawlers").summarise(crawlers)).toBe(
      "8 of 9 AI crawlers may read your site, including 4 of the 4 that fetch pages to answer people's questions.",
    );
    const citations =
      "2 of 5 HTML pages have FAQ, HowTo or Article schema or question-style headings " +
      "(full marks at half the pages).";
    expect(explanation("geo.citations").summarise(citations)).toBe(
      "2 of 5 pages are set out so AI assistants can quote them easily.",
    );
  });

  it("never read AI engine mentions, which are not scored yet", () => {
    expect(explanation("geo.aiEngines").summarise("anything")).toBeNull();
  });

  it.each([
    ["ready", "Measured in How the web sees you, not counted in the score yet."],
    ["not_connected", /^Not measured: Treg isn't connected/],
    ["no_searches", /^Not measured: no questions are chosen/],
    ["not_checked", /^How the web sees you hasn't asked AI assistants yet/],
  ] as const)("say where AI engine mentions stand when the outside view is %s", (state, line) => {
    expect(aiEnginesLine(state)).toMatch(line);
  });

  it("return null for wording they don't know", () => {
    for (const e of GEO_EXPLANATIONS)
      expect(e.summarise("Wording from an older formula")).toBeNull();
  });
});
