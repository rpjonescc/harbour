// The words around the tower's tiles (components/tower): headings inside a tile, link labels,
// "N more" lines and empty sentences. The sentences inside each tile come from tower-lights,
// tower-needs, tower-runway and tower-activity.

import type { TermId } from "./glossary";
import type { LightId } from "./tower";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const list = (words: readonly string[]) =>
  words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

export const SYSTEMS_TEXT = {
  /** Only when every light is fine: one working now or switched off says so instead. */
  allFine: "All eight are fine.",
  /** Nothing needs a look, but some lights are busy or off on purpose: named, not called fine. */
  calm: (working: readonly string[], off: readonly string[]) =>
    [
      "Nothing needs a look.",
      ...(working.length > 0 ? [`Working now: ${list(working)}.`] : []),
      ...(off.length > 0 ? [`Switched off: ${list(off)}.`] : []),
    ].join(" "),
  /** Beyond the five sentences shown, the rest stay one click away in the lights above. */
  more: (n: number) =>
    `${n} more ${plural(n, "light needs", "lights need")} a look. Open ${plural(n, "it", "them")} above to read why.`,
  /** A light's accessible name and visible words: "Worker: needs you". */
  lightName: (label: string, tone: string) => `${label}: ${tone}`,
  /** The link in an opened light: the fix for a light that needs a look, else where it lives. */
  fix: "How to fix",
  open: "Open the page",
  linkName: (link: string, label: string) => `${link}: ${label}`,
} as const;

/** The glossary word behind each light, explained at the top of its opened panel. */
export const LIGHT_TERMS: Readonly<Record<LightId, TermId | null>> = {
  website: null,
  worker: "worker",
  schedules: "schedule",
  checks: "check",
  backups: "backup",
  sources: "data-source",
  agents: "agent",
  spend: "budget",
};

export const NEEDS_TEXT = {
  more: (n: number) =>
    `${n} more after these. ${plural(n, "It moves", "They move")} up here as you finish these.`,
  /** The link beside "N more" when every hidden item waits in one place. */
  moreLink: (n: number) => (n === 1 ? "See the other one" : `See the other ${n}`),
} as const;

/** The tower header's sub-line: the date, when this page was drawn, and the jump list. */
export const HEADER_TEXT = {
  updated: (time: string) => `updated ${time}`,
  onThisPage: "On this page",
  reload: "Reload",
} as const;

/** Arrows always sit beside the trend's words; they are never the only sign. */
export const TREND_ARROW = { up: "↑", down: "↓", steady: "→" } as const;

export const RUNWAY_TEXT = {
  next: "Next:",
  noNext: "Nothing open for this product right now.",
  noProducts: "No products are set up yet, so there is nothing to show here.",
  addProduct: "Add a product in Settings",
} as const;

export const FEED_TEXT = {
  running: "Running now",
  finished: "Finished",
  nothingRunning: "Nothing is running right now.",
  nothingFinished: "Nothing finished in the last day.",
  more: (n: number) => `${n} more on the Agents page`,
  technicalTopic: "the names of these runs",
  /** Said in words beside the soft tint, so "new" never rests on colour alone. */
  isNew: "new",
  win: "win",
} as const;

export const WINS_TEXT = {
  barsCaption: "Cards finished each day",
  dayHeader: "Day",
  countHeader: "Cards finished",
} as const;
