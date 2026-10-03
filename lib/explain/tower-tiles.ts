// The words around the tower's tiles (components/tower): headings inside a tile, link labels,
// "N more" lines and empty sentences. The sentences inside each tile come from tower-lights,
// tower-needs, tower-runway and tower-activity.

import type { TermId } from "./glossary";
import type { LightId } from "./tower";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const SYSTEMS_TEXT = {
  allFine: "All eight are fine.",
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
  /** Said in words beside the soft tint, so "new" never rests on colour alone. */
  isNew: "new",
  win: "win",
} as const;

export const WINS_TEXT = {
  barsCaption: "Cards finished each day",
  dayHeader: "Day",
  countHeader: "Cards finished",
} as const;
