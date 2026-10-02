import { buildBriefing } from "@/lib/explain/briefing";
import type { Product, ProductId } from "@/lib/products/catalog";
import type { ActionPreview, ProductScores, SourceFailure, TodaySummary } from "./types";

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

/**
 * Placeholder data for the configured products until a first scan is scored. Always flagged
 * `isSample`; real source failures still show, and the briefing reads the sample's own data.
 */
export function sampleToday(
  products: readonly Product[],
  failures: readonly SourceFailure[] = [],
): TodaySummary {
  const first = products[0];
  if (!first) throw new Error("sampleToday needs at least one product");
  const second = products[1] ?? first;
  const scores = products.map((p) => sampleScores(p.id));
  const actions: ActionPreview[] = [
    {
      id: "sample-1",
      productId: first.id,
      area: "GEO",
      impact: "high",
      effort: "medium",
      title: "An AI assistant cites a competitor for one of your target questions",
      reason: "When people ask that question, they're pointed somewhere else.",
      who: "you",
      href: null,
    },
    {
      id: "sample-2",
      productId: second.id,
      area: "AEO",
      impact: "medium",
      effort: "small",
      title: "Add FAQ structured data to your most-visited page",
      reason: "Marked-up answers are the easiest for Google and AI assistants to quote.",
      who: "you",
      href: null,
    },
  ];
  const work = actions.map((a) => ({ productId: a.productId, area: a.area, who: a.who }));
  return {
    isSample: true,
    scannedAt: null,
    scanning: false,
    lastFailedAt: null,
    failures: [...failures],
    moreActions: 0,
    briefing: buildBriefing({ products, scores, work, failures }),
    scores,
    actions,
  };
}
