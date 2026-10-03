import { SUB_SCORES } from "@/lib/scan/score";
import { ACME_SCAN, entryOf, scoreOf } from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { SUB_SCORE_EXPLANATIONS, subScoreExplanation, subScoreLine, weakestFirst } from ".";

describe("subScoreLine", () => {
  it("reads a measured entry's evidence", () => {
    const technical = entryOf(scoreOf(ACME_SCAN), "seo.technical");
    if (!technical) throw new Error("no seo.technical entry");
    expect(subScoreLine(technical)).toBe(
      "5 of 6 pages Harbour visited loaded properly, and 2 link to a page that's missing.",
    );
  });

  it("reads a missing entry's reason", () => {
    expect(
      subScoreLine({ key: "seo.cwv", score: null, evidence: "PageSpeed is not connected" }),
    ).toBe("Not connected yet, so it isn't counted.");
  });

  it("says why a measured check of weight 0 isn't counted", () => {
    const result = scoreOf(ACME_SCAN);
    const faq = entryOf(result, "aeo.qaCoverage");
    const llms = entryOf(result, "geo.llmsTxt");
    if (!faq || !llms) throw new Error("missing entries");
    expect(subScoreLine(faq)).toBe(
      "2 of 5 pages are marked up as questions and answers. Measured, not counted: Google no " +
        "longer shows FAQ results.",
    );
    expect(subScoreLine(llms)).toBe(
      "Your site has an llms.txt guide for AI assistants. Measured, not counted: llms.txt has no " +
        "known effect.",
    );
  });

  it("reads a formula v2 entry that was counted without the note", () => {
    const v2 = {
      key: "aeo.qaCoverage",
      score: 100,
      weight: 0.4,
      evidence:
        "2 of 5 HTML pages have FAQPage, HowTo or QAPage markup (full marks at a quarter of the pages).",
    };
    expect(subScoreLine(v2)).toBe("2 of 5 pages are marked up as questions and answers.");
  });

  it("points AI engine mentions to How the web sees you, old wording or new", () => {
    const v3 = entryOf(scoreOf(ACME_SCAN), "geo.aiEngines");
    if (!v3) throw new Error("no geo.aiEngines entry");
    expect(subScoreLine(v3)).toBe(
      "Measured in How the web sees you, not counted in the score yet.",
    );
    const v2 = { ...v3, evidence: "AI engine mention checks not connected (they need API keys)." };
    expect(subScoreLine(v2, "not_connected")).toMatch(/^Not measured: Treg isn't connected/);
    expect(subScoreLine(v2, "ready")).toBe(
      "Measured in How the web sees you, not counted in the score yet.",
    );
  });

  // Review Focus 3: stored rows keep the wording and keys of the formula that scored them.
  it("falls back to the verdict's sentence for an older formula's wording or key", () => {
    expect(
      subScoreLine({ key: "seo.technical", score: 64, evidence: "Wording from an older formula" }),
    ).toBe("Working, but there's clear room to improve.");
    expect(subScoreLine({ key: "seo.retired", score: 90, evidence: "anything" })).toBe(
      "Doing really well. Keep it up.",
    );
    expect(subScoreExplanation("seo.retired")).toBeNull();
  });
});

describe("SUB_SCORE_EXPLANATIONS", () => {
  it("explains every sub-score key in the current formula, in order, and nothing else", () => {
    const formula = Object.values(SUB_SCORES)
      .flat()
      .map((spec) => spec.key);
    expect(SUB_SCORE_EXPLANATIONS.map((e) => e.key)).toEqual(formula);
    for (const e of SUB_SCORE_EXPLANATIONS) expect(isComplete(e.parts)).toBe(true);
  });

  it("gives every entry of a real scan a plain line with no codes", () => {
    for (const entry of scoreOf(ACME_SCAN)?.breakdown ?? []) {
      const line = subScoreLine(entry);
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toMatch(/\b(?:seo|geo|aeo)\.|HARBOUR_|\b(?:SEO|GEO|AEO)\b/);
    }
  });
});

describe("weakestFirst", () => {
  it("sorts ascending, keeps ties in order and puts entries without a number last", () => {
    const entries = [
      { key: "a", score: 80 },
      { key: "b", score: null },
      { key: "c", score: 30 },
      { key: "d", score: 80 },
    ];
    expect(weakestFirst(entries).map((e) => e.key)).toEqual(["c", "a", "d", "b"]);
    expect(entries.map((e) => e.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("puts checks that are measured but not counted after the counted ones", () => {
    const entries = [
      { key: "faq", score: 0, weight: 0 },
      { key: "a", score: 80, weight: 0.5 },
      { key: "gap", score: null, weight: 0.5 },
      { key: "c", score: 30, weight: 0.5 },
    ];
    expect(weakestFirst(entries).map((e) => e.key)).toEqual(["c", "a", "faq", "gap"]);
  });
});
