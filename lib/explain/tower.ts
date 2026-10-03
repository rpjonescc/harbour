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

/** The note card has no heading of its own, so its failure names it. */
export const NOTE_TILE = "Daily note";
export const NOTE_FAILED =
  "Harbour couldn't read the daily note just now. The rest of the page is fine, and it tries again at the next update.";

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

/** The headline when a tile behind it could not be read: said, never guessed. */
export const HEADLINE_UNREAD = {
  systems: "Harbour couldn't read its systems just now.",
  needs: "Harbour couldn't read what needs you just now.",
} as const;

export type HeadlineInput = {
  /** The system light that needs the owner (an `act` light only), also first in Needs you. */
  worst: { id: LightId; sentence: string } | null;
  /** Everything in Needs you (shown and beyond the five); null when it could not be read. */
  needsCount: number | null;
  /** Lights worth a look or that Harbour can't read (no `act` light among them). */
  looks?: number;
  /** False when the system lights could not be read. */
  systemsRead?: boolean;
};

/**
 * The tower's h1 in two parts: the lead (is everything OK?) and the sub-line (what needs you),
 * which the page announces politely when a refresh changes it.
 */
export function towerHeadlineParts(input: HeadlineInput): { lead: string; subline: string } {
  const { worst, needsCount, looks = 0, systemsRead = true } = input;
  const lead = !systemsRead
    ? HEADLINE_UNREAD.systems
    : worst !== null
      ? /[.!?]$/.test(worst.sentence)
        ? worst.sentence
        : `${worst.sentence}.`
      : looks > 0
        ? `Nothing is broken. ${looks === 1 ? "1 light is" : `${looks} lights are`} worth a look.`
        : "Everything is running.";
  if (needsCount === null) return { lead, subline: HEADLINE_UNREAD.needs };
  if (systemsRead && worst !== null) {
    const others = Math.max(0, needsCount - 1);
    return { lead, subline: others === 0 ? "Nothing else needs you." : things(others, "more ") };
  }
  return {
    lead,
    subline: needsCount === 0 ? "Nothing needs you right now." : things(needsCount, ""),
  };
}

/**
 * The tower's h1 as one sentence. `worst` is the system light that needs the owner (an `act`
 * light), which is also the first item in Needs you, so `needsCount` includes it.
 */
export function towerHeadline(input: HeadlineInput): string {
  const { lead, subline } = towerHeadlineParts(input);
  return `${lead} ${subline}`;
}
