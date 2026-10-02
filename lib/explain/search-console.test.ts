import { searchSummarySentence } from "./search-console";

const plain = (n: number) => String(n);

describe("searchSummarySentence", () => {
  it("says what the numbers mean, meaning first", () => {
    expect(searchSummarySentence(10, 240, plain)).toBe(
      "Google showed your pages 240 times, and 10 people clicked through.",
    );
    expect(searchSummarySentence(1, 1, plain)).toBe(
      "Google showed your pages 1 time, and 1 person clicked through.",
    );
    expect(searchSummarySentence(0, 12, plain)).toBe(
      "Google showed your pages 12 times, and nobody clicked through.",
    );
  });
  it("formats the numbers the way the caller says", () => {
    expect(searchSummarySentence(1234, 56789, (n) => n.toLocaleString("de-DE"))).toContain(
      "56.789",
    );
  });
});
