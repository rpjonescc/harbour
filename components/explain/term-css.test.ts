import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("the term tip's CSS", () => {
  it("fades in over the fast duration token, by opacity only", () => {
    expect(css).toMatch(
      /\.term-tip-fade\s*\{\s*animation:\s*term-tip-in\s+var\(--duration-fast\)\s+ease-out;/,
    );
    expect(css).toMatch(/@keyframes term-tip-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*\}/);
  });

  it("does not move at all under reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.term-tip-fade\s*\{\s*animation:\s*none;/,
    );
  });
});
