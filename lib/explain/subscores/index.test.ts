import { ACME_SCAN, entryOf, scoreOf } from "@/tests/helpers/scoring";
import { subScoreExplanation, subScoreLine } from ".";

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
