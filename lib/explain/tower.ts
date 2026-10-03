// The control tower's words (Today, `/`). Pure shapers in lib/tower return keys and numbers; every
// phrase the owner reads is built here. The light types live here too, so lib/explain never
// imports lib/tower.

/** The eight system lights, in their fixed order on the page. */
export type LightId =
  | "website"
  | "worker"
  | "schedules"
  | "checks"
  | "backups"
  | "sources"
  | "agents"
  | "spend";

/** How a light is doing. Shown by shape and words as well as colour, never colour alone. */
export type LightTone = "ok" | "busy" | "watch" | "act" | "off" | "unknown";

/** The h2 of each tower section, in reading order. */
export const SECTION_TITLES = {
  systems: "Systems",
  needs: "Needs you",
  work: "Where the work is",
  products: "Your products",
  activity: "What's happening",
  wins: "Wins this week",
} as const;

export const LIGHT_LABELS: Readonly<Record<LightId, string>> = {
  website: "Website",
  worker: "Worker",
  schedules: "Schedules",
  checks: "Checks",
  backups: "Backups",
  sources: "Sources",
  agents: "Agents",
  spend: "Spend",
};

/** A tone in words, read after the light's label ("Worker: needs you"). */
export const TONE_WORDS: Readonly<Record<LightTone, string>> = {
  ok: "fine",
  busy: "working",
  watch: "worth a look",
  act: "needs you",
  off: "switched off",
  unknown: "can't tell",
};

export const TILE_FAILED =
  "Harbour couldn't read this just now. The rest of the page is fine, and it tries again at the next update.";

export const NOTHING_NEEDS_YOU =
  "Nothing needs you right now. Harbour will put anything that does here.";

export const QUIET_WEEK =
  "A quiet week so far. Small steps still count: the next one is on the Board.";

export const UPDATES_PAUSED = "Updates paused. Reload to see the latest.";

/** The activity feed when nothing ran in 24 hours; `next` is the next run's local time. */
export function NOTHING_RAN(next: string | null): string {
  const none = "Nothing ran in the last day.";
  return next === null ? none : `${none} The next run is at ${next}.`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The calendar day of `at` in `timeZone`, as a UTC midnight timestamp (for day arithmetic). */
function localDay(at: Date, timeZone: string): number {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone })
    .format(at)
    .split("-")
    .map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/**
 * How long ago `at` was, in the owner's time zone: "just now", "4 min ago", "3 h ago",
 * "yesterday at 09:10", then "on 2 Oct". Formatted on the server, so no client clock is involved.
 */
export function agoPhrase(at: Date, now: Date, timeZone: string, locale: string): string {
  const age = now.getTime() - at.getTime();
  if (age < MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`;
  if (localDay(now, timeZone) - localDay(at, timeZone) === DAY) {
    const time = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at);
    return `yesterday at ${time}`;
  }
  return `on ${new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" }).format(at)}`;
}

const things = (n: number, more: string) =>
  n === 1 ? `1 ${more}thing needs you.` : `${n} ${more}things need you.`;

/**
 * The tower's h1. `worst` is the system light that needs the owner (an `act` light), which is
 * also the first item in Needs you, so `needsCount` includes it.
 */
export function towerHeadline(input: {
  worst: { id: LightId; sentence: string } | null;
  needsCount: number;
}): string {
  const { worst, needsCount } = input;
  if (worst === null) {
    const needs = needsCount === 0 ? "Nothing needs you right now." : things(needsCount, "");
    return `Everything is running. ${needs}`;
  }
  const lead = /[.!?]$/.test(worst.sentence) ? worst.sentence : `${worst.sentence}.`;
  const others = Math.max(0, needsCount - 1);
  return `${lead} ${others === 0 ? "Nothing else needs you." : things(others, "more ")}`;
}
