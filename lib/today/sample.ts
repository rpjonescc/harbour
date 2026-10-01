import type { Product, ProductId } from "@/lib/products/catalog";

export type Area = "SEO" | "GEO" | "AEO";

export type ProductScores = {
  productId: ProductId;
  seo: number;
  geo: number;
  aeo: number;
  deltas: Record<Area, number>;
  trend: number[];
};

export type ActionPreview = {
  id: string;
  productId: ProductId;
  area: Area;
  impact: "high" | "medium" | "low";
  title: string;
  effort: string;
};

export type TodaySummary = {
  isSample: boolean;
  scannedAt: Date | null;
  headline: string;
  scores: ProductScores[];
  actions: ActionPreview[];
};

/** Stable 32-bit FNV-1a hash, so sample numbers never change between runs. */
function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

function sampleScores(productId: ProductId): ProductScores {
  const hash = stableHash(productId);
  const byte = (n: number) => (hash >>> (n * 8)) & 0xff;
  const seo = 25 + (byte(0) % 50);
  // A flat-to-rising 6-point trend (0-2 points per step) that ends at today's score.
  const trend = Array.from({ length: 6 }, (_, i) => clamp(seo - (5 - i) * (byte(3) % 3)));
  return {
    productId,
    seo,
    geo: byte(1) % 30,
    aeo: 5 + (byte(2) % 35),
    deltas: { SEO: (byte(3) % 5) - 1, GEO: (byte(1) % 3) - 1, AEO: byte(2) % 2 },
    trend,
  };
}

/** Placeholder data for the configured products until the daily scan exists. Always flagged `isSample`. */
export function sampleToday(products: readonly Product[]): TodaySummary {
  const first = products[0];
  if (!first) throw new Error("sampleToday needs at least one product");
  const second = products[1] ?? first;
  return {
    isSample: true,
    scannedAt: null,
    headline: "Calm waters. Two things worth your attention.",
    scores: products.map((p) => sampleScores(p.id)),
    actions: [
      {
        id: "sample-1",
        productId: first.id,
        area: "GEO",
        impact: "high",
        title: "An AI assistant cites a competitor for one of your target questions",
        effort: "~1 hr",
      },
      {
        id: "sample-2",
        productId: second.id,
        area: "AEO",
        impact: "medium",
        title: "Add FAQ structured data to your most-visited page",
        effort: "~30 min",
      },
    ],
  };
}
