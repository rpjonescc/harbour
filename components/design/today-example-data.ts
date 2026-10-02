// Fictional Today data for /design, built around a configured product so its links resolve.
import { type Briefing, buildBriefing } from "@/lib/explain/briefing";
import type { Product } from "@/lib/products/catalog";
import type { ActionPreview, ProductScores } from "@/lib/today/types";

export type ExampleToday = {
  briefing: Briefing;
  scores: ProductScores[];
  actions: ActionPreview[];
};

/** One product's example Today: a partial score, a gap, and a card for each "who's on it". */
export function exampleToday(product: Pick<Product, "id" | "name">): ExampleToday {
  const scores: ProductScores[] = [
    {
      productId: product.id,
      scanned: true,
      totals: { seo: 78, geo: 46, aeo: null },
      complete: { seo: true, geo: false, aeo: false },
      deltas: { seo: 2, geo: -1, aeo: null },
      trend: [74, 76, 78],
    },
  ];
  const actions: ActionPreview[] = [
    {
      id: "example-claude",
      productId: product.id,
      area: "GEO",
      impact: "high",
      effort: "small",
      title: "Let AI search crawlers read your site",
      reason: "Assistants can't recommend pages they aren't allowed to read.",
      who: "claude",
      href: null,
    },
    {
      id: "example-pr",
      productId: product.id,
      area: "SEO",
      impact: "medium",
      effort: "medium",
      title: "Give every page its own title",
      reason: "Google uses the title as the headline of each result.",
      who: "pr_waiting",
      href: null,
    },
    {
      id: "example-you",
      productId: product.id,
      area: "AEO",
      impact: "low",
      effort: "large",
      title: "Answer common questions near the top of each guide",
      reason: "Short answers under a question are the ones Google and AI assistants quote.",
      who: "you",
      href: null,
    },
  ];
  const work = actions.map((a) => ({ productId: a.productId, area: a.area, who: a.who }));
  const briefing = buildBriefing({ products: [product], scores, work, failures: [] });
  return { briefing, scores, actions };
}
