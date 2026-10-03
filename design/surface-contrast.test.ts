import { themeColour } from "@/tests/helpers/tokens";
import { contrastRatio } from "./contrast";

const AA = 4.5;

// The text and background pairs the chips (components/ui/Tag.tsx) put together, by token.
const TAG_PAIRS = [
  ["accent", "accent-soft"],
  ["good", "surface-sunk"],
  ["ink", "warn-soft"],
  ["ink-muted", "surface-sunk"],
] as const;

const THEMES = ["light", "dark", "system-dark", "night"] as const;

// Body text and every status tone, on every surface a tile sits on.
const TEXT = ["ink", "ink-muted", "accent", "good", "warn", "bad"] as const;
const SURFACES = ["bg", "surface", "surface-sunk"] as const;

describe.each(THEMES)("text and status tones, %s theme", (theme) => {
  it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface] as const)))(
    "%s on %s keeps WCAG AA (4.5:1)",
    (text, surface) => {
      expect(
        contrastRatio(themeColour(theme, text), themeColour(theme, surface)),
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it("keeps text on the accent (a primary button) at WCAG AA", () => {
    expect(
      contrastRatio(themeColour(theme, "accent-ink"), themeColour(theme, "accent")),
    ).toBeGreaterThanOrEqual(AA);
  });
});

describe("the night theme", () => {
  it("is darker than dark, with warmer and dimmer ink", () => {
    const dark = (t: string) => themeColour("dark", t);
    const night = (t: string) => themeColour("night", t);
    const sum = (rgb: readonly number[]) => rgb.reduce((a, b) => a + b, 0);
    for (const surface of SURFACES) expect(sum(night(surface))).toBeLessThan(sum(dark(surface)));
    expect(sum(night("ink"))).toBeLessThan(sum(dark("ink")));
    const [red = 0, , blue = 0] = night("ink");
    expect(red - blue).toBeGreaterThan(0);
  });
});

describe.each(THEMES)("chip text, %s theme", (theme) => {
  it.each(TAG_PAIRS)("%s on %s keeps WCAG AA (4.5:1)", (text, background) => {
    expect(
      contrastRatio(themeColour(theme, text), themeColour(theme, background)),
    ).toBeGreaterThanOrEqual(AA);
  });
});
