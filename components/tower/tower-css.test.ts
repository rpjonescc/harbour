import { readdirSync, readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../../design/tokens.css", import.meta.url), "utf8");

/** The selectors a reduced-motion block switches off with `animation: none`. */
const stilled = [
  ...css.matchAll(
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*([^{}]*)\{\s*animation:\s*none;?\s*\}\s*\}/g,
  ),
].flatMap((m) => (m[1] ?? "").split(",").map((s) => s.trim()));

describe("the tower's motion", () => {
  it("breathes a working light slowly, forever, on a token", () => {
    expect(tokens).toMatch(/--duration-breathe:\s*2\.4s;/);
    expect(css).toMatch(
      /\.tower-breathe\s*\{[^}]*animation:\s*tower-breathe\s+var\(--duration-breathe\)\s+ease-in-out\s+infinite;/,
    );
  });

  it("moves only by opacity and transform", () => {
    const frames = [...css.matchAll(/@keyframes\s+tower-[a-z]+\s*\{([\s\S]*?)\n\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(1);
    for (const [, body] of frames) {
      const properties = new Set([...(body ?? "").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
      for (const property of properties) {
        expect(["opacity", "transform", "background-color"]).toContain(property);
      }
    }
  });

  it("holds still under prefers-reduced-motion", () => {
    expect(stilled).toContain(".tower-breathe");
  });

  it("hard-codes no colour", () => {
    const tower = css.slice(css.indexOf(".tower-breathe"), css.indexOf("/* Paper copies"));
    expect(tower).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

describe("the tower's components", () => {
  it("add no transition or animation of their own beyond the classes above", () => {
    const dir = new URL("./", import.meta.url);
    const sources = readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.includes(".test."));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      expect(readFileSync(new URL(file, dir), "utf8")).not.toMatch(/\btransition|\banimate-/);
    }
  });
});
