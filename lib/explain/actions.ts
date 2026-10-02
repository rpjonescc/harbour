import type { ActionActor, ActionStatus } from "@/lib/actions/types";
import type { Effort, Impact } from "@/lib/scan/issues";

export const IMPACT_PHRASE: Readonly<Record<Impact, string>> = {
  high: "Big win",
  medium: "Worth doing",
  low: "Small win",
};

export const EFFORT_PHRASE: Readonly<Record<Effort, string>> = {
  small: "quick job",
  medium: "an afternoon",
  large: "a project",
};

/** The Actions board's column for each status (the stored status values are unchanged). */
export const STATUS_COLUMN: Readonly<Record<ActionStatus, string>> = {
  suggested: "New ideas",
  open: "To do",
  in_progress: "In progress",
  done: "Done",
  snoozed: "Snoozed",
  dismissed: "Dismissed",
};

export type WhoOnIt = "claude" | "pr_waiting" | "you" | "undecided";

export const WHO_PHRASE: Readonly<Record<WhoOnIt, string>> = {
  claude: "Claude is on it",
  pr_waiting: "Pull request waiting for your OK",
  you: "Waiting for you",
  undecided: "New idea, not decided yet",
};

export type WhoInput = {
  status: ActionStatus;
  prUrl: string | null;
  /** Who made the latest status change (creation counts, a PR link does not); null if pruned. */
  statusActor: ActionActor | null;
};

/**
 * Who's on an action (spec §3): a suggestion is undecided; work in progress with a pull request
 * waits for the owner's OK; work Claude started is Claude's; anything else open or in progress
 * waits for the owner. Finished, snoozed and dismissed actions have no one on them.
 */
export function whoIsOnIt({ status, prUrl, statusActor }: WhoInput): WhoOnIt | null {
  if (status === "suggested") return "undecided";
  if (status === "open") return "you";
  if (status !== "in_progress") return null;
  if (prUrl !== null) return "pr_waiting";
  return statusActor === "claude" ? "claude" : "you";
}

/** The Actions board's group headings: a group holds many, so these are plural. */
export const IMPACT_GROUP: Readonly<Record<Impact, string>> = {
  high: "Big wins",
  medium: "Worth doing",
  low: "Small wins",
};

/** The board header's line: "3 to do · 1 in progress · 2 new ideas". */
export function boardSummary(counts: { open: number; in_progress: number; suggested: number }) {
  const ideas = counts.suggested === 1 ? "idea" : "ideas";
  return `${counts.open} to do · ${counts.in_progress} in progress · ${counts.suggested} new ${ideas}`;
}
