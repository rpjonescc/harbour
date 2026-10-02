import { formulaChangedArea, hasScoringNote, scoringNote } from "./scoring-notes";

describe("scoringNote", () => {
  it("explains the move to v2 in the spec's words", () => {
    expect(scoringNote({ from: "v1", to: "v2", at: new Date("2026-10-03T06:00:00Z") })).toBe(
      "Scoring updated: Preferred Sources now only counts for news sites.",
    );
  });

  it("says nothing without a change, and nothing for a version it has no note for", () => {
    expect(scoringNote(null)).toBeNull();
    expect(scoringNote({ from: "v2", to: "v9", at: new Date() })).toBeNull();
  });
});

describe("formulaChangedArea", () => {
  it("says only AEO changed on a product site in v2, and nothing on a news site", () => {
    expect(formulaChangedArea("product", "aeo", "v1", "v2")).toBe(true);
    expect(formulaChangedArea("product", "seo", "v1", "v2")).toBe(false);
    expect(formulaChangedArea("product", "geo", "v1", "v2")).toBe(false);
    for (const area of ["seo", "geo", "aeo"] as const)
      expect(formulaChangedArea("news", area, "v1", "v2")).toBe(false);
  });

  it("changes nothing between scores of the same version", () => {
    expect(formulaChangedArea("product", "aeo", "v2", "v2")).toBe(false);
  });

  it("counts every area as changed for a version it has no entry for, even across a gap", () => {
    expect(formulaChangedArea("news", "seo", "v2", "v3")).toBe(true);
    expect(formulaChangedArea("news", "seo", "v1", "v3")).toBe(true);
    expect(formulaChangedArea("product", "seo", "v1", "weird")).toBe(true);
  });

  it("reads a move back to an older version the same way", () => {
    expect(formulaChangedArea("product", "aeo", "v2", "v1")).toBe(true);
    expect(formulaChangedArea("product", "seo", "v2", "v1")).toBe(false);
  });
});

describe("hasScoringNote", () => {
  it("is true only for versions with a note", () => {
    expect(hasScoringNote("v2")).toBe(true);
    expect(hasScoringNote("v3")).toBe(false);
  });
});
