import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { buildFacts, type FactsInput } from "@/lib/explain/voice/facts";
import type { Note } from "@/lib/explain/voice/note";

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

const facts = (over: Partial<FactsInput>) => buildFacts(factsInput(over));

export const WEEKEND_FACTS = facts({
  local: { day: "2026-10-03", weekday: "Saturday", hour: 6, minute: 30 },
});
export const OUT_OF_HOURS_FACTS = facts({
  local: { day: "2026-10-02", weekday: "Friday", hour: 21, minute: 0 },
});
export const TROUBLE_FACTS = facts({
  trouble: ["the last check for Lighthouse Café didn't finish"],
});
/** No finished actions and no score rises: nothing to celebrate. */
export const NO_WINS_FACTS = facts({
  finishedTitles: [],
  products: factsInput().products.map((p) => ({ ...p, deltas: { seo: 0, geo: 0, aeo: 0 } })),
});
/** Every score under 70, nothing finished. */
export const WEAK_FACTS = facts({
  finishedTitles: [],
  products: [
    {
      name: "Acme Docs",
      scores: { seo: 62, geo: 41, aeo: 30 },
      deltas: { seo: 0, geo: 0, aeo: 0 },
      scoredLast24h: true,
    },
  ],
});

/** A note that passes every check against FACTS. */
export const GOOD_NOTE: Note = {
  greeting: "Morning, Sam.",
  headline: "A steady tide, and one win already.",
  body:
    "Acme Docs picked up 3 points in Found on Google, and the page titles job is finished, " +
    "which is the quiet kind of progress that adds up. Recommended by AI assistants has the most " +
    "room, so the short guide for AI assistants is a good place to start.",
  picks: ["Add a short guide to your site for AI assistants"],
  mood: "celebrate",
};

/** The note as the agent writes it: double-quoted YAML frontmatter, then the body. */
export function noteFileText(note: Note): string {
  const q = (text: string) => JSON.stringify(text);
  const lines = [
    "---",
    `greeting: ${q(note.greeting)}`,
    `headline: ${q(note.headline)}`,
    `mood: ${q(note.mood)}`,
    ...(note.picks.length > 0
      ? ["picks:", ...note.picks.map((p) => `  - ${q(p)}`)]
      : ["picks: []"]),
    ...(note.rest ? [`rest: ${q(note.rest)}`] : []),
    "---",
    note.body,
    "",
  ];
  return lines.join("\n");
}

/**
 * A job row for a daily note, as the worker leaves it. Only a succeeded one makes the note at
 * that stamp show (the worker's checker accepted it and the commit succeeded).
 */
export function seedNoteJob(
  db: Db,
  stamp: string,
  status: "queued" | "running" | "ok" | "failed" | "cancelled" = "ok",
): void {
  db.insert(jobs)
    .values({
      kind: "daily-note",
      params: { stamp },
      dedupeKey: `daily-note:${JSON.stringify([["stamp", stamp]])}`,
      status,
      requestedBy: null,
      createdAt: new Date("2026-10-02T05:30:00Z"),
    })
    .run();
}

/** A published note: the file in the brain and the succeeded job that vouches for it. */
export function seedPublishedNote(db: Db, root: string, stamp: string, note: Note): void {
  const file = join(root, `notes/daily/${stamp}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, noteFileText(note));
  seedNoteJob(db, stamp);
}
