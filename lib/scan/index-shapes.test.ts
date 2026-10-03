import { indexStatusValue } from "./index-shapes";

const BASE = {
  state: "indexed",
  verdict: "PASS",
  coverageState: "Submitted and indexed",
  lastCrawlTime: null,
  googleCanonical: null,
  robotsTxtState: null,
  pageFetchState: null,
  checkedAt: "2026-10-02T06:00:00.000Z",
};

describe("indexStatusValue", () => {
  it("reads old observations with neither failures nor attemptedAt", () => {
    expect(indexStatusValue.safeParse(BASE).success).toBe(true);
  });

  it("reads failures and attemptedAt together", () => {
    const both = { ...BASE, failures: 2, attemptedAt: "2026-10-03T06:00:00.000Z" };
    expect(indexStatusValue.safeParse(both).success).toBe(true);
  });

  it("rejects a lone failures or a lone attemptedAt", () => {
    expect(indexStatusValue.safeParse({ ...BASE, failures: 1 }).success).toBe(false);
    expect(
      indexStatusValue.safeParse({ ...BASE, attemptedAt: "2026-10-03T06:00:00.000Z" }).success,
    ).toBe(false);
  });
});
