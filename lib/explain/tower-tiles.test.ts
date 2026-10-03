import { GLOSSARY } from "./glossary";
import { LIGHT_LABELS } from "./tower";
import {
  FEED_TEXT,
  LIGHT_TERMS,
  NEEDS_TEXT,
  RUNWAY_TEXT,
  SYSTEMS_TEXT,
  TREND_ARROW,
  WINS_TEXT,
} from "./tower-tiles";

const CODES = /\b(?:SEO|GEO|AEO|HARBOUR_|scan)\b/;

describe("the tower tiles' words", () => {
  it("says the systems summary and the remainder in plain words, with plurals", () => {
    expect(SYSTEMS_TEXT.allFine).toBe("All eight are fine.");
    expect(SYSTEMS_TEXT.more(1)).toBe("1 more light needs a look. Open it above to read why.");
    expect(SYSTEMS_TEXT.more(3)).toBe("3 more lights need a look. Open them above to read why.");
    expect(SYSTEMS_TEXT.lightName("Worker", "needs you")).toBe("Worker: needs you");
    expect(SYSTEMS_TEXT.linkName(SYSTEMS_TEXT.fix, "Worker")).toBe("How to fix: Worker");
  });

  it("explains every light but the website with a glossary word that exists", () => {
    for (const id of Object.keys(LIGHT_LABELS) as (keyof typeof LIGHT_LABELS)[]) {
      const term = LIGHT_TERMS[id];
      if (id === "website") expect(term).toBeNull();
      else expect(term && GLOSSARY[term]).toBeTruthy();
    }
  });

  it("counts the needs beyond five kindly", () => {
    expect(NEEDS_TEXT.more(1)).toBe("1 more after these. It moves up here as you finish these.");
    expect(NEEDS_TEXT.more(2)).toBe("2 more after these. They move up here as you finish these.");
  });

  it("points the feed's remainder at the Agents page", () => {
    expect(FEED_TEXT.more(4)).toBe("4 more on the Agents page");
  });

  it("has an arrow for every trend direction", () => {
    expect(Object.keys(TREND_ARROW).sort()).toEqual(["down", "steady", "up"]);
  });

  it("uses no codes anywhere", () => {
    const words = [
      ...Object.values(RUNWAY_TEXT),
      ...Object.values(WINS_TEXT),
      FEED_TEXT.running,
      FEED_TEXT.finished,
      FEED_TEXT.nothingRunning,
      FEED_TEXT.nothingFinished,
      SYSTEMS_TEXT.allFine,
      SYSTEMS_TEXT.more(2),
      NEEDS_TEXT.more(2),
    ];
    for (const word of words) expect(word).not.toMatch(CODES);
  });
});
