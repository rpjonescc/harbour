// The sentence under each of the tower's system lights. The shaper (lib/tower/system.ts) decides
// the tone; these say what it means, in plain words, leading with the point.

const DAY = 24 * 60 * 60_000;

/** The calendar day of `at` in `timeZone`, as "2026-10-02". */
const dayIn = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);

/** "since 09:12" today, "since Tuesday" this week, else "since 2 Oct", in the owner's zone. */
export function sincePhrase(at: Date, now: Date, timeZone: string, locale: string): string {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(at);
  if (dayIn(at, timeZone) === dayIn(now, timeZone)) {
    return `since ${format({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
  }
  if (now.getTime() - at.getTime() < 6 * DAY) return `since ${format({ weekday: "long" })}`;
  return `since ${format({ day: "numeric", month: "short" })}`;
}

export const WEBSITE_UP = (since: string) => `Harbour's website is up. Running ${since}.`;

export const WORKER_SENTENCE = {
  ok: "The worker is running.",
  late: (minutes: number) =>
    `The worker hasn't checked in for ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  stopped: "The worker isn't running, so checks, backups and agents are waiting.",
  never: "Harbour hasn't heard from the worker yet. If you just started it, give it a minute.",
} as const;

export const SCHEDULE_SENTENCE = {
  allOff: "Every schedule is switched off.",
  allRan: (n: number) =>
    n === 1 ? "The one schedule that's on ran on time." : `All ${n} schedules ran on time.`,
  failed: (label: string, ago: string) => `${label}: didn't finish ${ago}.`,
  late: (label: string, ago: string) => `${label}: last ran ${ago}.`,
  never: (label: string) => `${label}: hasn't run yet.`,
  /** More than one schedule needs a look: the count, then the first one's sentence. */
  several: (n: number, first: string) => `${n} schedules need a look. ${first}`,
} as const;

export const CHECK_SENTENCE = {
  running: "Checking your sites now.",
  fresh: (ago: string) => `Checked ${ago}.`,
  late: (ago: string, name: string | null) =>
    name === null ? `Last checked ${ago}.` : `${name} was last checked ${ago}.`,
  never: (name: string | null) =>
    name === null ? "Not checked yet." : `${name} hasn't been checked yet.`,
  noSites: "There are no sites to check yet.",
  /** `names` are the products whose last check failed; `only` when just one product is set up. */
  failed: (names: readonly string[], only: boolean) => {
    if (only) return "The last check didn't finish.";
    if (names.length === 1) return `The last check for ${names[0]} didn't finish.`;
    return `The last check for ${names.length} sites didn't finish.`;
  },
} as const;

export const BACKUP_SENTENCE = {
  done: (ago: string) => `Backed up ${ago}.`,
  notesSaved: "Notes saved.",
  notesWaiting: (n: number) =>
    `${n} ${n === 1 ? "change" : "changes"} in your Second Brain haven't been saved for over an hour.`,
} as const;

export const SOURCES_SENTENCE = {
  ok: "All data sources answered.",
  none: "No data sources have answered yet.",
} as const;

export const AGENTS_SENTENCE = {
  idle: (finishedToday: number) => {
    if (finishedToday === 0) return "Nothing running.";
    return `Nothing running. ${finishedToday} ${finishedToday === 1 ? "run" : "runs"} finished today.`;
  },
  running: (label: string, waiting: number) =>
    `Running now: ${label}.${waiting > 0 ? ` ${waiting} more waiting.` : ""}`,
  waiting: (n: number) => `${n} ${n === 1 ? "run is" : "runs are"} waiting to start.`,
  failed: (labels: readonly string[]) =>
    labels.length === 1
      ? `A run didn't finish (${labels[0]}).`
      : `${labels.length} runs didn't finish.`,
} as const;

export const SPEND_SENTENCE = {
  thisMonth: (amounts: string) => `${amounts} this month.`,
  nearBudget: (percent: number) => `${percent}% of this month's budget used.`,
} as const;
