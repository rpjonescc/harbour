import { canonicalise, matchKey, skeleton, termPattern } from "./canonical";

describe("canonicalise", () => {
  it("removes hidden characters, folds width and accents, and keeps words apart", () => {
    expect(canonicalise("A\u200bcme\u202e  \uff24ocs\u0301\n\u2028x\u00ad")).toBe("Acme Docs x");
  });

  it("is stable when applied twice", () => {
    const once = canonicalise("Café \uff21\u0301 \u2460 \ufb01x");
    expect(canonicalise(once)).toBe(once);
  });
});

describe("skeleton", () => {
  it("keeps the length so a match can be cut from the original", () => {
    const text = "\u0405lack \u0665 \u{1d7d8} Z\u03b5phyr \u{1f600}";
    expect(skeleton(text).length).toBe(text.length);
  });

  it("maps lookalike letters and foreign digits", () => {
    expect(skeleton("\u0420r\u043eject \u0665")).toBe("Project 0");
  });
});

describe("termPattern", () => {
  it("matches a term across spacing, case, lookalikes and accents", () => {
    const pattern = termPattern("Project Zephyr");
    for (const text of [
      "project zephyr",
      "PROJECT-ZEPHYR",
      "p r o j e c t z e p h y r",
      "Pr\u043ejectZephyr",
    ]) {
      expect(matchKey(text).search(pattern ?? /$^/)).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns null for a term with no letters or digits", () => {
    expect(termPattern("")).toBeNull();
    expect(termPattern(" \u200b - ")).toBeNull();
  });
});
