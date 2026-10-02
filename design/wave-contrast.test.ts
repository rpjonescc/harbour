import { themeColour } from "@/tests/helpers/tokens";
import { contrastRatio, over } from "./contrast";
import { WAVE_LAYERS } from "./wave";

// Every text colour the app puts directly on the page background, where the wave can sit behind it.
const TEXT = ["ink", "ink-muted", "accent", "good", "warn", "bad"] as const;
const AA = 4.5;

describe.each(["light", "dark", "system-dark"] as const)(
  "text over the wave, %s theme",
  (theme) => {
    const page = themeColour(theme, "bg");
    const tide = themeColour(theme, "accent-soft");
    // Worst case: every layer stacked on the same pixel.
    const worst = WAVE_LAYERS.reduce((under, layer) => over(under, tide, layer.opacity), page);

    it.each(TEXT)("%s keeps WCAG AA (4.5:1) over all layers stacked", (token) => {
      expect(contrastRatio(themeColour(theme, token), worst)).toBeGreaterThanOrEqual(AA);
    });

    it("starts from text that passes on the plain page, so the wave is what is being tested", () => {
      for (const token of TEXT) {
        expect(contrastRatio(themeColour(theme, token), page)).toBeGreaterThanOrEqual(AA);
      }
    });
  },
);

describe("the check bites", () => {
  it("fails for a wave that is too strong: muted text under 30% full accent in dark mode", () => {
    const strong = over(themeColour("dark", "bg"), themeColour("dark", "accent"), 0.3);
    expect(contrastRatio(themeColour("dark", "ink-muted"), strong)).toBeLessThan(AA);
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
    ]) {
      expect(themeColour("system-dark", token)).toEqual(themeColour("dark", token));
    }
  });
});
