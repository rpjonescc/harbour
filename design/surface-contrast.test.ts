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

describe.each(["light", "dark", "system-dark"] as const)("chip text, %s theme", (theme) => {
  it.each(TAG_PAIRS)("%s on %s keeps WCAG AA (4.5:1)", (text, background) => {
    expect(
      contrastRatio(themeColour(theme, text), themeColour(theme, background)),
    ).toBeGreaterThanOrEqual(AA);
  });
});
