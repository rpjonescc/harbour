import type { LocalMoment, Weekday } from "@/lib/format/zoned-time";
import type { Effort, Impact } from "@/lib/scan/issues";
import type { AreaValues } from "@/lib/scan/views";
import { EFFORT_PHRASE, IMPACT_PHRASE, WHO_PHRASE, type WhoOnIt } from "../actions";
import { AREA_ORDER, AREAS } from "../areas";
import { trendPhrase, verdictFor } from "../verdict";
import { type DayPart, dayPartOf, type Rest, restOf } from "./day-part";

/** What Harbour has gathered, as plain values (the worker fills it; nothing here does I/O). */
export type FactsInput = {
  local: LocalMoment;
  ownerFirstName: string | null;
  products: {
    name: string;
    scores: AreaValues<number | null>;
    deltas: AreaValues<number | null>;
    /** The product's latest scan finished in the last 24 hours (so its change counts as a win). */
    scoredLast24h: boolean;
  }[];
  /** The active actions, board order. */
  actions: { id: number; title: string; impact: Impact; effort: Effort; who: WhoOnIt | null }[];
  finishedTitles: string[];
  /** Plain sentences, from `troubleLines`. */
  trouble: string[];
  recentHeadlines: string[];
};

/** The facts snapshot the agent is given and the checker holds it to (spec §3.3). */
export type Facts = {
  date: string;
  weekday: Weekday;
  time: string;
  dayPart: DayPart;
  rest: Rest | null;
  ownerFirstName: string | null;
  products: {
    name: string;
    areas: { name: string; score: number; verdict: string; change: string | null }[];
    /** Areas with no score: a gap, never a zero. */
    noScoreYet: string[];
  }[];
  actions: { id: number; title: string; howBig: string; howLong: string; whoOnIt: string | null }[];
  wins: string[];
  trouble: string[];
  recentHeadlines: string[];
};

/** Bounds the snapshot, so a big board or a long title cannot grow the prompt. */
export const FACT_CAPS = {
  products: 12,
  actions: 12,
  wins: 8,
  trouble: 6,
  headlines: 5,
  finished: 5,
  text: 140,
} as const;

const tidy = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, FACT_CAPS.text);
const two = (n: number) => String(n).padStart(2, "0");

function productFacts(p: FactsInput["products"][number]): Facts["products"][number] {
  const areas = AREA_ORDER.flatMap((key) => {
    const score = p.scores[key];
    if (score === null) return [];
    return [
      {
        name: AREAS[key].name,
        score,
        verdict: verdictFor(score).label,
        change: trendPhrase(p.deltas[key]),
      },
    ];
  });
  const noScoreYet = AREA_ORDER.filter((key) => p.scores[key] === null).map((k) => AREAS[k].name);
  return { name: tidy(p.name), areas, noScoreYet };
}

function winsOf(input: FactsInput): string[] {
  const finished = input.finishedTitles
    .slice(0, FACT_CAPS.finished)
    .map((title) => `Finished: ${tidy(title)}`);
  const rises = input.products.flatMap((p) =>
    p.scoredLast24h
      ? AREA_ORDER.flatMap((key) => {
          const delta = p.deltas[key];
          const change = delta !== null && delta > 0 ? trendPhrase(delta) : null;
          return change ? [`${AREAS[key].name} for ${tidy(p.name)} is ${change}`] : [];
        })
      : [],
  );
  return [...finished, ...rises].slice(0, FACT_CAPS.wins);
}

/** The snapshot for the agent: bounded, single-line strings, no secrets or paths. */
export function buildFacts(input: FactsInput): Facts {
  const { local } = input;
  return {
    date: local.day,
    weekday: local.weekday,
    time: `${two(local.hour)}:${two(local.minute)}`,
    dayPart: dayPartOf(local.hour),
    rest: restOf(local),
    ownerFirstName: input.ownerFirstName,
    products: input.products.slice(0, FACT_CAPS.products).map(productFacts),
    actions: input.actions.slice(0, FACT_CAPS.actions).map((a) => ({
      id: a.id,
      title: tidy(a.title),
      howBig: IMPACT_PHRASE[a.impact],
      howLong: EFFORT_PHRASE[a.effort],
      whoOnIt: a.who === null ? null : WHO_PHRASE[a.who],
    })),
    wins: winsOf(input),
    trouble: input.trouble.slice(0, FACT_CAPS.trouble).map(tidy),
    recentHeadlines: input.recentHeadlines.slice(0, FACT_CAPS.headlines).map(tidy),
  };
}

/** Every number written in digits in `text` (thousands separators and decimals understood). */
export function numbersIn(text: string): number[] {
  const plain = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  return (plain.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/**
 * Every figure the note may use: scores, changes, counts, the date and time, and the figures
 * inside the facts' own sentences (titles, wins, trouble). Past headlines are left out, so an
 * old note's number cannot make a new one look honest.
 */
export function figuresOf(facts: Facts): Set<number> {
  const figures = new Set<number>([
    facts.products.length,
    facts.actions.length,
    facts.wins.length,
    facts.trouble.length,
  ]);
  const texts = [
    facts.date,
    facts.time,
    ...facts.actions.map((a) => a.title),
    ...facts.wins,
    ...facts.trouble,
    ...facts.products.flatMap((p) => p.areas.map((a) => a.change ?? "")),
  ];
  for (const text of texts) for (const n of numbersIn(text)) figures.add(n);
  for (const p of facts.products) for (const a of p.areas) figures.add(a.score);
  return figures;
}
