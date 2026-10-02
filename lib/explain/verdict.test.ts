import {
  averageScore,
  GAP_REASONS,
  gapReason,
  trendPhrase,
  VERDICT_BANDS,
  verdictBandsText,
  verdictFor,
} from "./verdict";

describe("verdictFor", () => {
  it.each([
    [100, "Strong"],
    [85, "Strong"],
    [84, "Good"],
    [70, "Good"],
    [69, "Fair"],
    [50, "Fair"],
    [49, "Needs work"],
    [0, "Needs work"],
  ] as const)("reads %d as %s", (score, label) => {
    expect(verdictFor(score).label).toBe(label);
  });

  it("gives each band its own tone and sentence", () => {
    expect(verdictFor(90)).toEqual({
      label: "Strong",
      tone: "strong",
      sentence: "Doing really well. Keep it up.",
    });
    expect(verdictFor(75)).toEqual({
      label: "Good",
      tone: "good",
      sentence: "In good shape, with a little room to improve.",
    });
    expect(verdictFor(60)).toEqual({
      label: "Fair",
      tone: "fair",
      sentence: "Working, but there's clear room to improve.",
    });
    expect(verdictFor(30)).toEqual({
      label: "Needs work",
      tone: "weak",
      sentence: "Holding you back, so it's worth fixing first.",
    });
  });

  it("reads no score as a gap with its reason, never as Needs work", () => {
    expect(verdictFor(null, "Speed data is still arriving.")).toEqual({
      label: "No score yet",
      tone: "gap",
      sentence: "Speed data is still arriving.",
    });
    expect(verdictFor(null).sentence).toBe("No data yet, so there's no verdict.");
    expect(verdictFor(null, "  ").sentence).toBe("No data yet, so there's no verdict.");
    // Review Focus 2: a number that isn't one is a gap too.
    expect(verdictFor(Number.NaN, GAP_REASONS.notChecked)).toEqual({
      label: "No score yet",
      tone: "gap",
      sentence: "Not checked yet.",
    });
  });

  it("puts a fraction in the band its number falls in, and out-of-range numbers at the ends", () => {
    expect(verdictFor(84.9).label).toBe("Good");
    expect(verdictFor(120).label).toBe("Strong");
    expect(verdictFor(-1).label).toBe("Needs work");
  });
});

describe("trendPhrase", () => {
  it("says up, down or steady since the last check, and nothing without a change to read", () => {
    expect(trendPhrase(2)).toBe("up 2 since the last check");
    expect(trendPhrase(-3)).toBe("down 3 since the last check");
    expect(trendPhrase(0)).toBe("steady");
    expect(trendPhrase(null)).toBeNull();
    expect(trendPhrase(Number.NaN)).toBeNull();
  });
});

describe("verdictBandsText", () => {
  it("lists every band with its range", () => {
    expect(VERDICT_BANDS.map((band) => band.min)).toEqual([85, 70, 50, 0]);
    expect(verdictBandsText()).toBe(
      "Strong (85 or more), Good (70–84), Fair (50–69), Needs work (under 50)",
    );
  });
});

describe("averageScore", () => {
  it("rounds the mean and says nothing for no scores", () => {
    expect(averageScore([64, 41])).toBe(53);
    expect(averageScore([85])).toBe(85);
    expect(averageScore([])).toBeNull();
  });
});

describe("gapReason", () => {
  it("tells data that didn't arrive from a failed or missing check", () => {
    expect(gapReason({ scanned: true, lastCheckFailed: true })).toBe(GAP_REASONS.dataMissing);
    expect(gapReason({ scanned: false, lastCheckFailed: true })).toBe(GAP_REASONS.checkFailed);
    expect(gapReason({ scanned: false, lastCheckFailed: false })).toBe(GAP_REASONS.notChecked);
  });
});
