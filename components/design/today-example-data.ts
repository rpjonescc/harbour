// Fictional Today data for /design, built around a configured product so its links resolve.
import { type Briefing, buildBriefing } from "@/lib/explain/briefing";
import { SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import type { NoteSlot } from "@/lib/note/view";
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
      lastCheckFailed: false,
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
  const briefing = buildBriefing({
    products: [product],
    scores,
    work,
    failures: [],
    failedChecks: [],
    backup: "ok",
  });
  return { briefing, scores, actions };
}

const WRITTEN = new Date("2026-10-02T05:30:00Z");

/** Fictional note cards for /design: a good morning, a weekend, the quiet gap and the sample. */
export const EXAMPLE_NOTES: { label: string; slot: NoteSlot }[] = [
  {
    label: "Note · a good morning (celebrating: the wave ripples once)",
    slot: {
      noteTime: "06:30",
      tokenSet: true,
      view: {
        kind: "note",
        at: WRITTEN,
        note: {
          greeting: "Morning, Sam.",
          headline: "The tide turned overnight.",
          body: "Acme Docs picked up a few points in Found on Google, and finishing the page titles job is why. Nothing dramatic, just the steady sort of progress that adds up. The guide for AI assistants has the most room, and it is a good place to start with your coffee.",
          picks: ["Add a short guide to your site for AI assistants"],
          mood: "celebrate",
        },
      },
    },
  },
  {
    label: "Note · a weekend, with what can wait",
    slot: {
      noteTime: "06:30",
      tokenSet: true,
      view: {
        kind: "note",
        at: WRITTEN,
        note: {
          greeting: "Saturday, then.",
          headline: "Nothing here needs you today.",
          body: "Your sites are in fair shape, the list is short and friendly, and the weather is doing its own thing. If you do pop in, the quick job at the top is a gentle one.",
          picks: [],
          rest: "Everything on the list will keep until Monday; the harbour will still be here.",
          mood: "steady",
        },
      },
    },
  },
  {
    label: "Note · no note yet today",
    slot: {
      noteTime: "06:30",
      tokenSet: true,
      view: { kind: "gap", line: "No note yet today. The next one is written at 06:30." },
    },
  },
  {
    label: "Note · the sample Today",
    slot: { noteTime: "06:30", tokenSet: true, view: { kind: "sample", note: SAMPLE_NOTE } },
  },
];
