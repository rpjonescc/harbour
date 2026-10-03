import type { ActionActor, ActionStage, ActionStatus } from "@/lib/actions/types";
import type { Effort, Impact } from "@/lib/scan/issues";

export const IMPACT_PHRASE: Readonly<Record<Impact, string>> = {
  high: "Big win",
  medium: "Worth doing",
  low: "Small win",
};

/** The size of a win's chip tone: one answer for the board, Today and the issue cards. */
export function impactTone(impact: Impact): "warn" | "neutral" {
  return impact === "high" ? "warn" : "neutral";
}

export const EFFORT_PHRASE: Readonly<Record<Effort, string>> = {
  small: "quick job",
  medium: "an afternoon",
  large: "a project",
};

/** The Actions list's name for each status (the stored status values are unchanged). */
export const STATUS_COLUMN: Readonly<Record<ActionStatus, string>> = {
  suggested: "New ideas",
  open: "Backlog",
  in_progress: "In progress",
  done: "Done",
  snoozed: "Snoozed",
  dismissed: "Dismissed",
};

/** Said when an API call finds the owner signed out. */
export const SIGN_IN_ENDED =
  "Your sign-in has ended. Reload the page and sign in again, then try again.";

export type WhoOnIt = "claude" | "pr_waiting" | "review_waiting" | "you" | "undecided";

export const WHO_PHRASE: Readonly<Record<WhoOnIt, string>> = {
  claude: "Claude is on it",
  pr_waiting: "Pull request waiting for your OK",
  review_waiting: "Waiting for you to look it over",
  you: "Waiting for you",
  undecided: "New idea, not decided yet",
};

export type WhoInput = {
  status: ActionStatus;
  prUrl: string | null;
  /** In review (stage `in_review`) with no pull request still waits on the owner. */
  stage: ActionStage | null;
  /** Who made the latest status change (creation counts, a PR link does not); null if pruned. */
  statusActor: ActionActor | null;
};

/**
 * Who's on an action (spec §3): a suggestion is undecided; work in progress with a pull request
 * waits for the owner's OK, and work In review without one waits for the owner's look, whoever
 * moved it; work Claude started is Claude's; anything else open or in progress waits for the
 * owner. Finished, snoozed and dismissed actions have no one on them.
 */
export function whoIsOnIt({ status, prUrl, stage, statusActor }: WhoInput): WhoOnIt | null {
  if (status === "suggested") return "undecided";
  if (status === "open") return "you";
  if (status !== "in_progress") return null;
  if (prUrl !== null) return "pr_waiting";
  if (stage === "in_review") return "review_waiting";
  return statusActor === "claude" ? "claude" : "you";
}

export type StatusChip = { text: string; tone: "accent" | "warn" | "neutral" };

/**
 * The chip beside an action's size of win, for the board and the issue cards: who's on it, else
 * where it stands. `stillFound` is the issue card, which sits on a page about what the last check
 * found, so a done action says it is still found; null is an issue the rule sync hasn't tracked
 * yet. `day` words a stored YYYY-MM-DD (the caller's locale), which keeps formatting out of here.
 */
export function statusChip(
  action: { status: ActionStatus; who: WhoOnIt | null; snoozedUntil: string | null } | null,
  day: (isoDay: string) => string,
  stillFound = false,
): StatusChip {
  if (action === null) return { text: "Tracking starts with the next check", tone: "neutral" };
  if (action.who) return { text: WHO_PHRASE[action.who], tone: "accent" };
  if (action.status === "done" && stillFound) {
    return { text: "Done — still found in the last check", tone: "warn" };
  }
  if (action.status === "snoozed" && action.snoozedUntil) {
    return { text: `Snoozed until ${day(action.snoozedUntil)}`, tone: "neutral" };
  }
  return { text: STATUS_COLUMN[action.status], tone: "neutral" };
}

/** The Actions board's group headings: a group holds many, so these are plural. */
export const IMPACT_GROUP: Readonly<Record<Impact, string>> = {
  high: "Big wins",
  medium: "Worth doing",
  low: "Small wins",
};

/** The list header's line: "3 in Backlog · 1 in progress · 2 new ideas". */
export function boardSummary(counts: {
  open: number;
  in_progress: number;
  suggested: number;
}): string {
  const ideas = counts.suggested === 1 ? "idea" : "ideas";
  return `${counts.open} in ${STATUS_COLUMN.open} · ${counts.in_progress} in progress · ${counts.suggested} new ${ideas}`;
}

/** "3 things worth doing": Today's sub-line and the sidebar badge say it the same way. */
export function thingsWorthDoing(n: number): string {
  return `${n} ${n === 1 ? "thing" : "things"} worth doing`;
}
