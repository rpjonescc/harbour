import type { Product, ProductId } from "@/lib/products/catalog";
import type { ProductScores, TodaySummary } from "./types";

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
    totals: { seo, geo: byte(1) % 30, aeo: 5 + (byte(2) % 35) },
    complete: { seo: true, geo: true, aeo: true },
    deltas: { seo: (byte(3) % 5) - 1, geo: (byte(1) % 3) - 1, aeo: byte(2) % 2 },
    trend,
  };
}

/** Placeholder data for the configured products until a first scan is scored. Always flagged `isSample`. */
export function sampleToday(products: readonly Product[]): TodaySummary {
  const first = products[0];
  if (!first) throw new Error("sampleToday needs at least one product");
  const second = products[1] ?? first;
  return {
    isSample: true,
    scannedAt: null,
    scanning: false,
    lastFailedAt: null,
    failures: [],
    moreActions: 0,
    headline: "Calm waters. Two things worth your attention.",
    scores: products.map((p) => sampleScores(p.id)),
    actions: [
      {
        id: "sample-1",
        productId: first.id,
        area: "GEO",
        impact: "high",
        title: "An AI assistant cites a competitor for one of your target questions",
        detail: "~1 hr",
        href: null,
      },
      {
        id: "sample-2",
        productId: second.id,
        area: "AEO",
        impact: "medium",
        title: "Add FAQ structured data to your most-visited page",
        detail: "~30 min",
        href: null,
      },
    ],
  };
}
