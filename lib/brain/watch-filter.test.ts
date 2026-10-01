import { isIgnoredChange } from "./watch-filter";

describe("isIgnoredChange", () => {
  it("ignores git and hidden paths only", () => {
    expect(isIgnoredChange(".git/index")).toBe(true);
    expect(isIgnoredChange("research/.draft.md")).toBe(true);
    expect(isIgnoredChange("research/geo/a.md")).toBe(false);
    expect(isIgnoredChange(null)).toBe(false);
  });
});
