import { firstSentence } from "./reason";

describe("firstSentence", () => {
  it.each([
    [
      "Pages without a description get a generated snippet. Google writes its own.",
      "Pages without a description get a generated snippet.",
    ],
    ["  Two\nlines and no full stop  ", "Two lines and no full stop"],
    ["Is it fast? Mostly.", "Is it fast?"],
    ["Loads in 2.5 seconds on a phone. That's slow.", "Loads in 2.5 seconds on a phone."],
    [
      "Add a button, e.g. near recent articles. Then wait.",
      "Add a button, e.g. near recent articles.",
    ],
    [
      "Use a short title, i.e. under 60 characters. Done.",
      "Use a short title, i.e. under 60 characters.",
    ],
    ["Big vs. small pages matter. Next.", "Big vs. small pages matter."],
    // "etc." often ends a sentence, so it is not treated as an abbreviation.
    ["Titles, descriptions, etc. Then links.", "Titles, descriptions, etc."],
    ["", ""],
  ])("reads %j as %j", (text, sentence) => {
    expect(firstSentence(text)).toBe(sentence);
  });

  // Review Focus 5: the weekly analyst may write up to 800 characters, on several lines.
  it("shortens a long first sentence at a word, with an ellipsis", () => {
    const short = firstSentence(`${"word ".repeat(60)}end.`);
    expect(short.length).toBeLessThanOrEqual(160);
    expect(short.endsWith("word…")).toBe(true);
    expect(firstSentence("a".repeat(200))).toHaveLength(160);
  });
});
