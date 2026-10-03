import { GLOSSARY } from "./glossary";
import { LIGHT_LABELS } from "./tower";
import {
  FEED_TEXT,
  HEADER_TEXT,
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

  it("names lights that are working or switched off instead of calling them fine", () => {
    expect(SYSTEMS_TEXT.calm(["Checks"], [])).toBe("Nothing needs a look. Working now: Checks.");
    expect(SYSTEMS_TEXT.calm([], ["Backups", "Spend"])).toBe(
      "Nothing needs a look. Switched off: Backups and Spend.",
    );
    expect(SYSTEMS_TEXT.calm(["Checks", "Agents", "Worker"], ["Backups"])).toBe(
      "Nothing needs a look. Working now: Checks, Agents and Worker. Switched off: Backups.",
    );
  });

  it("words the header's sub-line", () => {
    expect(HEADER_TEXT.updated("09:42")).toBe("updated 09:42");
    expect(HEADER_TEXT.onThisPage).toBe("On this page");
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
    expect(NEEDS_TEXT.moreLink(1)).toBe("See the other one");
    expect(NEEDS_TEXT.moreLink(3)).toBe("See the other 3");
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
      SYSTEMS_TEXT.calm(["Checks"], ["Backups"]),
      ...Object.values(HEADER_TEXT).map((w) => (typeof w === "string" ? w : w("09:42"))),
    ];
    for (const word of words) expect(word).not.toMatch(CODES);
  });
});
