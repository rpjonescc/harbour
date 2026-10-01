import { collectorLabel } from "./labels";

describe("collectorLabel", () => {
  it("names known collectors and falls back to the id", () => {
    expect(collectorLabel("search-console")).toBe("Search Console");
    expect(collectorLabel("rankings")).toBe("rankings");
  });
});
