import { quotesSnippets } from "./overlap";

const TERMS = ["acme docs"];
const SNIPPETS = ["Acme Docs: the sidebar collapses whenever a title is longer than the column"];

describe("quotesSnippets", () => {
  it("is true for a theme that repeats 20 or more characters of a snippet", () => {
    expect(
      quotesSnippets("Noticed the sidebar collapses whenever a title was long", SNIPPETS, TERMS),
    ).toBe(true);
  });

  it("is true across case, spacing and lookalike letters", () => {
    expect(
      quotesSnippets("THE  SIDEBAR  COLLAPSES whenever a title is longer", SNIPPETS, TERMS),
    ).toBe(true);
  });

  it("is false for the model's own words, and for a run made only of the product's terms", () => {
    expect(quotesSnippets("Fixed how long page titles wrap in the sidebar", SNIPPETS, TERMS)).toBe(
      false,
    );
    expect(quotesSnippets("Acme Docs", ["Acme Docs"], TERMS)).toBe(false);
  });

  it("does not count a run that spans a product term", () => {
    expect(quotesSnippets("work on Acme Docs sidebar", ["work on Acme Docs sidebar"], TERMS)).toBe(
      false,
    );
  });

  it("is false for a short theme and for no snippets", () => {
    expect(quotesSnippets("sidebar", SNIPPETS, TERMS)).toBe(false);
    expect(quotesSnippets("A completely different sentence here", [], TERMS)).toBe(false);
  });
});
