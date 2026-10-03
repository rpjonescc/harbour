import { themeColour } from "@/tests/helpers/tokens";
import { contrastRatio } from "./contrast";
import { OCEAN_TOKENS } from "./wave";

// Every text colour the app puts directly on the page background, where the ocean can sit behind it.
const TEXT = ["ink", "ink-muted", "accent", "good", "warn", "bad"] as const;
const AA = 4.5;

describe.each(["light", "dark", "system-dark"] as const)(
  "text over the ocean, %s theme",
  (theme) => {
    // Every wave layer and foam line is opaque and the fade ends in its token, so each ocean pixel
    // is one of these colours (or the page between them): checking all of them checks the most
    // intense pixel (in dark, the foam line).
    it.each(TEXT.flatMap((text) => OCEAN_TOKENS.map((ocean) => [text, ocean] as const)))(
      "%s on --%s keeps WCAG AA (4.5:1)",
      (text, ocean) => {
        expect(
          contrastRatio(themeColour(theme, text), themeColour(theme, ocean)),
        ).toBeGreaterThanOrEqual(AA);
      },
    );

    it("starts from text that passes on the plain page, so the ocean is what is being tested", () => {
      for (const token of TEXT) {
        expect(
          contrastRatio(themeColour(theme, token), themeColour(theme, "bg")),
        ).toBeGreaterThanOrEqual(AA);
      }
    });

    it("stays a backdrop: no ocean colour is far from the page (under 1.4:1)", () => {
      const page = themeColour(theme, "bg");
      for (const ocean of OCEAN_TOKENS) {
        expect(contrastRatio(themeColour(theme, ocean), page)).toBeLessThan(1.4);
      }
    });
  },
);

describe("the check bites", () => {
  it("fails for an ocean that is too deep: muted text on the border colour used as water", () => {
    // --line (--paper-300) as a wave: a plausible, slightly too strong choice.
    expect(
      contrastRatio(themeColour("light", "ink-muted"), themeColour("light", "line")),
    ).toBeLessThan(AA);
  });

  it("reads the system dark theme as the dark theme (their blocks are kept in sync by hand)", () => {
    for (const token of [
      "bg",
      "surface",
      "ink",
      "ink-muted",
      "accent",
      "accent-soft",
      "good",
      "warn",
      "bad",
      ...OCEAN_TOKENS,
    ]) {
      expect(themeColour("system-dark", token)).toEqual(themeColour("dark", token));
    }
  });
});
