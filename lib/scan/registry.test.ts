import { COLLECTORS } from "./registry";

describe("COLLECTORS", () => {
  it("runs the crawler first, then readiness (which reads it), then PageSpeed", () => {
    expect(COLLECTORS.map((c) => c.id)).toEqual(["crawler", "readiness", "pagespeed"]);
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
});
