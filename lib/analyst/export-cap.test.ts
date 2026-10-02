import type { ProductExport, WeeklyExport } from "./export";
import { CAP_STEPS, capExport, MAX_EXPORT_BYTES } from "./export-cap";

const IMPACTS = ["low", "medium", "high"] as const;
const STATUSES = ["snoozed", "suggested", "open", "in_progress"] as const;
const long = (n: number, c = "x") => c.repeat(n);
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

function product(
  i: number,
  size: { issues: number; examples: number; text: number },
): ProductExport {
  return {
    id: `p${i}`,
    name: `Product ${i}`,
    url: `https://p${i}.example.com`,
    scores: Array.from({ length: 7 }, (_, d) => ({
      date: `2026-09-2${d}`,
      formulaVersion: "v1",
      seo: 50 + d,
      geo: null,
      aeo: 30,
      complete: { seo: true, geo: false, aeo: true },
    })),
    deltas: { seo: 6, geo: null, aeo: 0 },
    subScores: Array.from({ length: 12 }, (_, k) => ({
      key: `seo.k${k}`,
      label: `Sub-score ${k}`,
      score: k % 3 === 0 ? null : 70,
      status: k % 3 === 0 ? "missing" : "ok",
      evidence: long(size.text, "e"),
    })),
    issues: Array.from({ length: size.issues }, (_, k) => ({
      id: `rule-${k}`,
      title: `Issue ${k} ${long(size.text, "t")}`,
      impact: IMPACTS[k % 3] ?? "low",
      total: 40,
      examples: Array.from(
        { length: size.examples },
        (_, e) => `https://p${i}.example.com/${e}/${long(size.text, "u")}`,
      ),
    })),
    collectors: [{ collector: "crawler", status: "ok", error: null }],
    searchConsole: { clicks: 1, impressions: 2, priorImpressions: null },
    competitors: [
      { name: "Rival", url: "https://rival.example.com", status: "approved" },
      { name: "Maybe", url: "https://maybe.example.com", status: "proposed" },
    ],
  };
}

function exportOf(products: ProductExport[], actions = 60, resolved = 30): WeeklyExport {
  return {
    week: "2026-W40",
    generatedAt: "2026-10-04T19:00:00.000Z",
    timeZone: "Europe/London",
    window: { from: "2026-09-27", to: "2026-10-04" },
    products,
    actions: Array.from({ length: actions }, (_, k) => ({
      id: k + 1,
      productId: "p0",
      area: "SEO",
      title: `Action ${k} ${long(80, "a")}`,
      impact: IMPACTS[k % 3] ?? "low",
      status: STATUSES[k % 4] ?? "open",
      source: "rule",
      ageDays: k,
    })),
    resolvedThisWeek: Array.from({ length: resolved }, (_, k) => ({
      productId: "p0",
      title: `Resolved ${k}`,
      at: `2026-10-0${(k % 4) + 1}T06:00:00.000Z`,
    })),
    truncated: [],
  };
}

describe("capExport", () => {
  it("leaves an export under the cap untouched", () => {
    const data = exportOf([product(0, { issues: 3, examples: 2, text: 20 })], 5, 2);
    expect(capExport(data)).toBe(JSON.stringify(data));
  });

  it("cuts an oversized export to valid JSON under 48 KiB, recording each step in order", () => {
    const data = exportOf([0, 1, 2].map((i) => product(i, { issues: 8, examples: 2, text: 1500 })));
    expect(bytes(JSON.stringify(data))).toBeGreaterThan(MAX_EXPORT_BYTES);
    const out = capExport(data);
    expect(bytes(out)).toBeLessThanOrEqual(MAX_EXPORT_BYTES);
    const parsed = JSON.parse(out) as WeeklyExport;
    expect(parsed.truncated.length).toBeGreaterThan(1);
    expect(parsed.truncated).toEqual(CAP_STEPS.slice(0, parsed.truncated.length));
    expect(parsed.products[0]?.issues[0]?.examples).toEqual([]);
    expect(parsed.products[0]?.subScores[1]?.evidence).toHaveLength(120);
  });

  it("is deterministic and does not change its input", () => {
    const data = exportOf([0, 1, 2].map((i) => product(i, { issues: 8, examples: 2, text: 1500 })));
    const before = JSON.stringify(data);
    expect(capExport(data)).toBe(capExport(data));
    expect(JSON.stringify(data)).toBe(before);
  });

  it("applies every step when needed, keeping the most important items", () => {
    // Bulk only in the issue titles, so every earlier step runs before the last one fits.
    const data = exportOf(
      [0, 1].map((i) => product(i, { issues: 40, examples: 1, text: 1000 })),
      60,
      30,
    );
    const parsed = JSON.parse(capExport(data, 32 * 1024)) as WeeklyExport;
    expect(parsed.truncated).toEqual([...CAP_STEPS]);
    const [first] = parsed.products;
    expect(first?.scores).toHaveLength(1);
    expect(first?.scores[0]?.date).toBe("2026-09-26");
    expect(first?.competitors.map((c) => c.status)).toEqual(["approved"]);
    expect(first?.subScores.every((s) => s.status === "ok")).toBe(true);
    expect(first?.issues).toHaveLength(5);
    expect(first?.issues.map((i) => i.impact)).toEqual(["high", "high", "high", "high", "high"]);
    expect(parsed.resolvedThisWeek).toHaveLength(20);
    expect(parsed.resolvedThisWeek[0]?.title).toBe("Resolved 0");
    expect(parsed.actions).toHaveLength(40);
    expect(parsed.actions[0]).toMatchObject({ impact: "high", status: "in_progress" });
    expect(parsed.actions.at(-1)?.impact).not.toBe("high");
  });

  it("fails rather than cutting the JSON when every step is not enough", () => {
    // Collector errors are never cut: 20 products with 3000-character errors stay over 48 KiB.
    const products = Array.from({ length: 20 }, (_, i) => ({
      ...product(i, { issues: 1, examples: 0, text: 10 }),
      collectors: [{ collector: "crawler", status: "failed" as const, error: long(3000) }],
    }));
    expect(() => capExport(exportOf(products))).toThrow(
      "Weekly export is over 48 KiB even after truncation",
    );
  });
});
