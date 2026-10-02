import { SUB_SCORES } from "@/lib/scan/score";
import { ACME_SCAN, entryOf, scoreOf } from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { SUB_SCORE_EXPLANATIONS, subScoreExplanation, subScoreLine } from ".";

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
