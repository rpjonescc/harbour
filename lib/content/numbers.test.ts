import { extractNumbers, unknownNumbers } from "./numbers";

describe("extractNumbers", () => {
  it.each([
    ["Pay $12.50 for 3 projects", ["12.5", "3"]],
    ["Up 40% since 2026, about 1,000 teams", ["40", "2026", "1000"]],
    ["twelve steps, two minutes, twenty teams", ["12", "2", "20"]],
    ["Only one idea, and p3 or x86 stay quiet", []],
    ["Five minutes and 5 minutes", ["5"]],
  ])("reads %j", (text, numbers) => expect(extractNumbers(text)).toEqual(numbers));

  it.each([
    ["items 3,4 and 1,000,000", ["3", "4", "1000000"]],
    ["012.50 and 7.0", ["12.5", "7"]],
    ["TWELVE and Twenty", ["12", "20"]],
    [
      "a figure of 12345678901234567890 and 12345678901234567891",
      ["12345678901234567890", "12345678901234567891"],
    ],
  ])("normalises %j", (text, numbers) => expect(extractNumbers(text)).toEqual(numbers));

  it.each([
    ["full-width digits", "Only １２ people and ＄９", ["12", "9"]],
    ["Arabic-Indic digits", "In ٢٠١٩ we shipped", ["2019"]],
    ["mathematical digits", "About \u{1d7d0}\u{1d7d1} teams", ["23"]],
    ["superscript digits", "That is 10²", ["102"]],
    ["digits split by a zero-width space", "It costs 1\u200b2 dollars", ["12"]],
    ["digits split by a joiner and a soft hyphen", "Up 4\u200d0\u00ad% a year", ["40"]],
    ["a bidi mark inside a year", "In 20\u202e19 we", ["2019"]],
    ["a spelled-out number with a zero-width space", "tw\u200belve teams", ["12"]],
    ["full-width letters", "ｔｗｅｌｖｅ teams", ["12"]],
  ])("sees %s the way a reader does", (_label, text, numbers) =>
    expect(extractNumbers(text)).toEqual(numbers),
  );

  it("does not take words that merely contain a number word", () => {
    expect(
      extractNumbers("Between the tenth and the tendency, a network of fivefold gains"),
    ).toEqual([]);
  });

  it("copes with very long text without hanging", () => {
    const long = `${"9".repeat(50_000)} ${"word ".repeat(50_000)}`;
    expect(extractNumbers(long)).toHaveLength(1);
  });
});

describe("unknownNumbers", () => {
  it("lists the numbers in the text that no source holds", () => {
    expect(
      unknownNumbers(
        "Free for 3 projects since 2024, a $9 plan",
        "The free plan has three projects.",
      ),
    ).toEqual(["2024", "9"]);
    expect(unknownNumbers("Nothing numeric here", "Anything 5")).toEqual([]);
  });

  it.each([
    ["a year", "Launched in 2019.", ["2019"]],
    ["a price", "It costs $9 a month.", ["9"]],
    ["a spelled-out number", "Twelve teams use it.", ["12"]],
    ["a statistic", "It cut setup time by 37%.", ["37"]],
    ["a hidden-character statistic", "It cut time by 3\u200b7%.", ["37"]],
    ["a full-width statistic", "It cut time by ３７%.", ["37"]],
  ])("fails %s that is in no source", (_label, text, expected) =>
    expect(
      unknownNumbers(text, "The free plan has three projects. Setup takes 5 minutes."),
    ).toEqual(expected),
  );

  it("passes numbers the sources hold, however they are written", () => {
    expect(
      unknownNumbers("Three projects, 5 minutes, 1,000 teams", "3 projects, five min, 1000 teams"),
    ).toEqual([]);
    expect(unknownNumbers("About ５ minutes", "Takes 5 minutes")).toEqual([]);
  });
});
