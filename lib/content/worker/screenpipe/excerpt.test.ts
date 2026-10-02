import { termPattern } from "./canonical";
import { cutExcerpts } from "./excerpt";

const pattern = termPattern("acme docs") as RegExp;
const words = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");

describe("cutExcerpts", () => {
  it("cuts about 120 characters either side of the term", () => {
    const text = `${words(60, "before")} Acme Docs ${words(60, "after")}`;
    const [only, ...rest] = cutExcerpts(text, [pattern]);
    expect(rest).toEqual([]);
    expect(only).toContain("Acme Docs");
    expect(only).not.toContain("before0 ");
    expect(only?.length).toBeLessThanOrEqual(300);
  });

  it("starts the next excerpt after the last one when the two cannot be joined, repeating no words", () => {
    // Two terms about 200 characters apart: their context cannot fit one 300-character excerpt.
    const text = `${words(25, "one")} Acme Docs ${words(30, "mid")} Acme Docs ${words(25, "two")}`;
    const out = cutExcerpts(text, [pattern]);
    expect(out.length).toBe(2);
    const seen = new Set<string>();
    for (const excerpt of out) {
      for (const word of excerpt.split(/\s+/)) {
        if (/\d/.test(word)) {
          expect(seen.has(word), word).toBe(false);
          seen.add(word);
        }
      }
    }
    for (const excerpt of out) expect(excerpt.length).toBeLessThanOrEqual(300);
  });

  it("makes no excerpt for text without the term and at most five for a frame that repeats it", () => {
    expect(cutExcerpts("nothing here", [pattern])).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => `Acme Docs ${words(70, `r${i}x`)}`).join(" ");
    expect(cutExcerpts(many, [pattern]).length).toBeLessThanOrEqual(5);
  });
});
