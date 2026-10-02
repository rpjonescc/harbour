import { pageResult, pagesSummary } from "./pages";

describe("pageResult", () => {
  it.each([
    [200, "Loaded (200)"],
    [301, "Moved (301)"],
    [404, "Not found (404)"],
    [403, "Refused (403)"],
    [503, "Server error (503)"],
    [0, "No proper answer (0)"],
  ] as const)("reads %d as %s", (status, text) => {
    expect(pageResult(status)).toBe(text);
  });
});

describe("pagesSummary", () => {
  const row = (n: number) => ({ problems: Array.from({ length: n }, () => "x") });
  it("counts the pages with something to fix", () => {
    expect(pagesSummary([row(1), row(0), row(2)], 3)).toBe(
      "Harbour checked 3 pages. 2 have something to fix.",
    );
    expect(pagesSummary([row(1)], 1)).toBe("Harbour checked 1 page. 1 has something to fix.");
    expect(pagesSummary([row(0)], 1)).toBe("Harbour checked 1 page. Nothing needs fixing.");
  });
  it("says at least when the table is cut off and every listed page has a problem", () => {
    expect(pagesSummary([row(1), row(1)], 80)).toBe(
      "Harbour checked 80 pages. At least 2 have something to fix.",
    );
  });
});
