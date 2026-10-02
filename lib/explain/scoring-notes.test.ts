import { scoringNote } from "./scoring-notes";

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
