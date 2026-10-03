import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const CELEBRATE = 'body:has([data-mood="celebrate"]) .wave-layer[data-front]';

describe("the wave's CSS", () => {
  it("drifts each layer at its own speed and phase, forever", () => {
    expect(css).toMatch(
      /\.wave-drift\s*\{[^}]*animation:\s*wave-drift\s+var\(--wave-seconds\)\s+linear\s+var\(--wave-delay\)\s+infinite;/,
    );
  });

  it("bobs each layer gently, back and forth, forever", () => {
    expect(css).toMatch(
      /\.wave-layer\s*\{[^}]*animation:\s*wave-bob\s+var\(--bob-seconds\)\s+ease-in-out\s+var\(--bob-delay\)\s+infinite\s+alternate;/,
    );
  });

  it("shimmers each foam line slowly, out of step with the others", () => {
    expect(css).toMatch(
      /\.wave-crest\s*\{[^}]*animation:\s*wave-shimmer\s+[\d.]+s\s+ease-in-out\s+var\(--bob-delay\)\s+infinite\s+alternate;/,
    );
  });

  it("moves only by transform, which the browser can run without layout or paint", () => {
    const frames = [...css.matchAll(/@keyframes\s+wave-[a-z]+\s*\{([\s\S]*?)\n\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(4);
    for (const [, body] of frames) {
      const properties = [...(body ?? "").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(new Set(properties)).toEqual(new Set(["transform"]));
    }
  });

  it("is left out of print", () => {
    expect(css).toMatch(/@media print\s*\{\s*\[data-wave\]\s*\{\s*display:\s*none;\s*\}\s*\}/);
  });

  it("plays one ripple on the front layer for a celebrating note, once", () => {
    // The bob is listed first so it carries on once the ripple has played.
    const rule = new RegExp(
      `${CELEBRATE.replace(/[()[\]]/g, "\\$&")}\\s*\\{\\s*animation:\\s*wave-bob[^,;]*infinite alternate,\\s*wave-ripple\\s+5s\\s+ease-in-out\\s+1;`,
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
    expect(selectors).toContain(".wave-crest");
    expect(selectors).toContain(CELEBRATE);
  });

  it("hard-codes no colour", () => {
    const wave = css.slice(css.indexOf(".wave-sky"));
    expect(wave).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});
