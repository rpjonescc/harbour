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
      extractNumbers(
        "Between the tenth and the tendency, a network of fivefolds and tenable plans",
      ),
    ).toEqual([]);
  });

  it.each([
    ["tenfold, twofold and twelve-fold", ["10", "2", "12"]],
    ["thirty, forty percent and ninety", ["30", "40", "90"]],
    ["a hundred and forty percent", ["100", "40"]],
    ["a thousand, a million, a billion", ["1000", "1000000", "1000000000"]],
    ["twenty-five teams and Ninety-nine users", ["25", "99"]],
    ["twenty\u2011one and thirty\u2013two", ["21", "32"]],
    ["twenty-first and twenty one", ["20"]],
  ])("reads spelled-out numbers: %j", (text, numbers) =>
    expect(extractNumbers(text)).toEqual(numbers),
  );

  it("does not count 'one', or number words inside longer words", () => {
    expect(extractNumbers("One in 2026, someone's anyone, a hundredth")).toEqual(["2026"]);
  });

  it.each([
    ["Top10 and Save50 and Q4", ["10", "50", "4"]],
    ["p3, v2, v2.0, x86, h1, H6, b2b, B2C, 3D, 2FA, i18n, a11y", []],
    ["see p12 and v10 but not Q3", ["3"]],
  ])("reads digits glued to a letter, except known names: %j", (text, numbers) =>
    expect(extractNumbers(text)).toEqual(numbers),
  );

  it("copes with very long text without hanging", () => {
    const long = `${"9".repeat(50_000)} ${"word ".repeat(50_000)}`;
    expect(extractNumbers(long)).toHaveLength(1);
  });
});

describe("zero, plural magnitudes and k, m, b suffixes", () => {
  it("reads them as figures, so a piece cannot slip one past the sources", () => {
    expect(extractNumbers("Zero setup and thousands of teams")).toEqual(["0", "1000"]);
    expect(extractNumbers("Hundreds of pages, millions of views")).toEqual(["100", "1000000"]);
    expect(extractNumbers("10k users, 2.5m views, 3B rows")).toEqual([
      "10000",
      "2500000",
      "3000000000",
    ]);
  });

  it("matches the spelled-out or comma form the sources hold", () => {
    expect(unknownNumbers("10k users", "We have 10,000 users")).toEqual([]);
    expect(unknownNumbers("thousands of teams", "one thousand teams")).toEqual([]);
    expect(unknownNumbers("20k users", "We have 10,000 users")).toEqual(["20000"]);
  });

  it("leaves names and unit suffixes alone", () => {
    expect(extractNumbers("A b2b tool with a 5mb limit")).toEqual(["5"]);
  });
});

describe("hidden characters inside a number", () => {
  it("cannot split it: a digit run broken by a variation selector or a braille blank is still one number", () => {
    expect(extractNumbers("It cut time by 4\u{e0101}0 percent")).toEqual(["40"]);
    expect(extractNumbers("It cost 1\u28002\u3164 dollars")).toEqual(["12"]);
    expect(unknownNumbers("Cut by 4\u{e0101}0%", "no figures here")).toEqual(["40"]);
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

  it.each([
    ["twenty-five teams", "Twenty teams use it.", ["25"]],
    ["a hundred and forty percent", "Forty teams.", ["100"]],
    ["forty percent", "Twenty teams use it.", ["40"]],
    ["a tenfold gain", "Twenty teams.", ["10"]],
    ["Top10 picks", "Twenty teams.", ["10"]],
  ])("fails %j against %j", (text, source, expected) =>
    expect(unknownNumbers(text, source)).toEqual(expected),
  );

  it("passes ordinary text, names and numbers the sources hold", () => {
    expect(unknownNumbers("One in 2026 chose v2 on p3 with x86", "It was 2026.")).toEqual([]);
    expect(unknownNumbers("We write plain docs for small teams. The page is live.", "")).toEqual(
      [],
    );
    expect(unknownNumbers("twenty-five teams, forty percent", "25 teams and 40%")).toEqual([]);
  });

  it("passes numbers the sources hold, however they are written", () => {
    expect(
      unknownNumbers("Three projects, 5 minutes, 1,000 teams", "3 projects, five min, 1000 teams"),
    ).toEqual([]);
    expect(unknownNumbers("About ５ minutes", "Takes 5 minutes")).toEqual([]);
  });
});
