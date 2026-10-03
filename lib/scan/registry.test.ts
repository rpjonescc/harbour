import { PAID_SOURCES } from "@/lib/costs/paid-sources";
import { COLLECTOR_IDS } from "./labels";
import { COLLECTORS } from "./registry";

describe("COLLECTORS", () => {
  it("runs the crawler first, then readiness (which reads it), PageSpeed, Search Console and indexing", () => {
    expect(COLLECTORS.map((c) => c.id)).toEqual([
      "crawler",
      "readiness",
      "pagespeed",
      "search-console",
      "indexing",
    ]);
  });

  it("matches the collector list the web UI reads from labels.ts", () => {
    expect(COLLECTORS.map((c) => c.id)).toEqual(COLLECTOR_IDS);
  });

  it("runs every collector after each collector it depends on", () => {
    const ids = COLLECTORS.map((c) => c.id);
    for (const [index, collector] of COLLECTORS.entries()) {
      for (const dependency of collector.dependsOn ?? []) {
        const at = ids.indexOf(dependency);
        expect(at, `${collector.id} depends on ${dependency}`).toBeGreaterThanOrEqual(0);
        expect(at, `${collector.id} runs after ${dependency}`).toBeLessThan(index);
      }
    }
  });

  it("declares a paid collector exactly when a paid source names it", () => {
    const paid = COLLECTORS.filter((c) => c.paid).map((c) => c.id);
    const named = PAID_SOURCES.flatMap((s) => (s.collector === null ? [] : [s.collector]));
    expect(paid.sort()).toEqual(named.sort());
  });

  it("runs indexing after the crawler (sitemap pages) and Search Console (its credentials)", () => {
    expect(COLLECTORS.find((c) => c.id === "indexing")?.dependsOn).toEqual([
      "crawler",
      "search-console",
    ]);
  });

  it("has only free collectors in this phase", () => {
    expect(COLLECTORS.map((c) => c.paid)).toEqual([false, false, false, false, false]);
  });
});
