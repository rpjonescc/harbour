import { nextTheme, parseTheme } from "./theme";

describe("theme preference", () => {
  it("parses known values and defaults to system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("night")).toBe("night");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
  });

  it("cycles system → light → dark → night → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("night");
    expect(nextTheme("night")).toBe("system");
  });
});
