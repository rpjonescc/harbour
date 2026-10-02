import { hasControlChars, hasInvisible, stripInvisible } from "./hidden-chars";

describe("hidden characters", () => {
  it.each([
    ["a zero-width space", "\u200b"],
    ["a bidi override", "\u202e"],
    ["a variation selector from the supplement", "\u{e0101}"],
    ["a tag character", "\u{e0041}"],
    ["a braille blank", "\u2800"],
    ["a Hangul filler", "\u3164"],
    ["a half-width Hangul filler", "\uffa0"],
    ["an interlinear annotation mark", "\ufff9"],
    ["a Mongolian variation selector", "᠋"],
    ["a soft hyphen", "\u00ad"],
    ["a line separator", "\u2028"],
  ])("sees %s and strips it", (_label, char) => {
    expect(hasInvisible(`a${char}b`)).toBe(true);
    expect(stripInvisible(`a${char}b`)).toBe("ab");
  });

  it("leaves ordinary text, accents and emoji alone", () => {
    for (const text of ["Plain text, café, naïve.", "Tab\tand\nnewline", "Done ✅"])
      expect(hasInvisible(text)).toBe(false);
  });

  it("finds control characters, allowing a newline always and a tab or return only when asked", () => {
    expect(hasControlChars("a\u0000b")).toBe(true);
    expect(hasControlChars("a\u009fb")).toBe(true);
    expect(hasControlChars("a\u007fb")).toBe(true);
    expect(hasControlChars("a\nb")).toBe(false);
    expect(hasControlChars("a\tb")).toBe(true);
    expect(hasControlChars("a\tb", { tab: true })).toBe(false);
    expect(hasControlChars("a\rb")).toBe(true);
    expect(hasControlChars("a\rb", { carriageReturn: true })).toBe(false);
  });
});
