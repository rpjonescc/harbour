import { buildFacts, type FactsInput } from "@/lib/explain/voice/facts";

/** Fictional facts input for a Friday 06:30 morning: Acme Docs and Lighthouse Café. */
export const factsInput = (over: Partial<FactsInput> = {}): FactsInput => ({
  local: { day: "2026-10-02", weekday: "Friday", hour: 6, minute: 30 },
  ownerFirstName: "Sam",
  products: [
    {
      name: "Acme Docs",
      scores: { seo: 62, geo: 41, aeo: null },
      deltas: { seo: 3, geo: null, aeo: null },
      scoredLast24h: true,
    },
    {
      name: "Lighthouse Café",
      scores: { seo: 80, geo: 55, aeo: 48 },
      deltas: { seo: 0, geo: 0, aeo: 0 },
      scoredLast24h: true,
    },
  ],
  actions: [
    {
      id: 1,
      title: "Add a short guide to your site for AI assistants",
      impact: "high",
      effort: "small",
      who: "you",
    },
    {
      id: 2,
      title: "Answer opening-hours questions in one line",
      impact: "medium",
      effort: "small",
      who: "you",
    },
  ],
  finishedTitles: ["Fix the missing page titles"],
  trouble: [],
  recentHeadlines: ["Calm waters this morning"],
  ...over,
});

export const FACTS = buildFacts(factsInput());
