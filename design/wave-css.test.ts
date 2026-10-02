import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const CELEBRATE = 'body:has([data-mood="celebrate"]) .wave-layer[data-front]';

describe("the wave's CSS", () => {
  it("drifts each layer at its own speed, forever", () => {
    expect(css).toMatch(
      /\.wave-drift\s*\{[^}]*animation:\s*wave-drift\s+var\(--wave-seconds\)\s+linear\s+infinite;/,
    );
  });

  it("plays one ripple on the front layer for a celebrating note, once", () => {
    const rule = new RegExp(
      `${CELEBRATE.replace(/[()[\]]/g, "\\$&")}\\s*\\{\\s*animation:\\s*wave-ripple\\s+5s\\s+ease-in-out\\s+1;`,
    );
    expect(css).toMatch(rule);
  });

  it("is still under prefers-reduced-motion: drift and ripple both off", () => {
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*([^{}]*\.wave-drift[^{}]*)\{\s*animation:\s*none;?\s*\}\s*\}/.exec(
        css,
      );
    expect(reduced).not.toBeNull();
    const selectors = reduced?.[1] ?? "";
    expect(selectors).toContain(".wave-drift");
    expect(selectors).toContain(".wave-layer");
    expect(selectors).toContain(CELEBRATE);
  });

  it("hard-codes no colour", () => {
    const wave = css.slice(css.indexOf(".wave-layer"));
    expect(wave).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
