import { filterHits } from "./hits";
import type { Hit } from "./schema";

const RULES = {
  excludeApps: [],
  terms: ["acme docs"],
  productHost: "docs.example.com",
  neverMention: [],
};
const hit = (text: string, minute = 0): Hit => ({
  text,
  timestamp: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
  app: "",
  window: "",
});
// A word of letters only that is different for every number and is never a cue.
const word = (i: number) =>
  `zq${i.toString(26).replace(/\d/g, (d) => String.fromCharCode(113 + Number(d)))}zq`;
const steps = (text: string) => [...text.matchAll(/step zq(\w+)zq/g)].map((m) => m[1]);

describe("filterHits: the whole day, not the first of it", () => {
  it("spreads 250 large frames at 5-minute steps over the day instead of spending the budget on the first", () => {
    const filler = "lorem ".repeat(1_400); // about 8.4k characters a frame
    const hits = Array.from({ length: 250 }, (_, i) =>
      hit(`Acme Docs step ${word(i)} ${filler}`, i * 5),
    );
    const { kept, truncated } = filterHits(hits, RULES);
    expect(truncated).toBe(true);
    const minutes = kept.map((k) => steps(k)[0]).filter((s) => s !== undefined);
    const index = (s: string) => hits.findIndex((h) => h.text.includes(`zq${s}zq`));
    const at = minutes.map((m) => index(m as string) * 5);
    expect(at.length).toBeGreaterThan(8);
    expect(Math.min(...at)).toBeLessThan(120);
    expect(Math.max(...at)).toBeGreaterThan(1_000); // of 1,245 minutes: reaches the late part of the day
  });

  it("treats frames that differ only in a changed clock or counter as one", () => {
    const hits = Array.from({ length: 50 }, (_, i) =>
      hit(
        `Acme Docs fixed the sidebar at 10:${String(i).padStart(2, "0")} after ${i * 7} edits`,
        i,
      ),
    );
    expect(filterHits(hits, RULES).kept).toHaveLength(1);
  });

  it("deduplicates before spending the budget, so repeats do not crowd out other frames", () => {
    const same = Array.from({ length: 200 }, (_, i) =>
      hit(`Acme Docs same screen ${"lorem ".repeat(1_500)} ${i}`, i),
    );
    const other = hit("Acme Docs a different screen entirely", 300);
    const kept = filterHits([...same, other], RULES).kept;
    expect(kept.some((k) => k.includes("different screen"))).toBe(true);
  });
});

describe("filterHits: hostile frames cost bounded time per product", () => {
  const hostile = [
    `Acme Docs ${"a.".repeat(4_900)}`,
    `Acme Docs ${"p.".repeat(4_900)}`,
    `Acme Docs ${"a/".repeat(4_900)}`,
    `Acme Docs ${"<a".repeat(4_900)}`,
    `Acme Docs ${"3f9a".repeat(2_400)}`,
    `Acme Docs ${"a@".repeat(4_900)}`,
  ];

  it("reads a product's worth of such frames within a couple of seconds, load included", () => {
    const hits = Array.from({ length: 60 }, (_, i) =>
      hit(`${hostile[i % hostile.length]} ${word(i)}`, i),
    );
    const start = performance.now();
    filterHits(hits, RULES);
    expect(performance.now() - start).toBeLessThan(2_500);
  });

  it.each(hostile.map((text, i) => [i, text] as const))(
    "hostile frame %i alone is quick",
    (_i, text) => {
      const start = performance.now();
      filterHits([hit(text)], RULES);
      expect(performance.now() - start).toBeLessThan(1_000);
    },
  );
});
