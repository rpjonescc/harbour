import type { OwnerChange } from "@/lib/actions/transitions";
import type { ActionActor, ActionStatus } from "@/lib/actions/types";
import type { ActionFilter } from "@/lib/actions/views";
import type { Impact } from "@/lib/scan/issues";

/** Group headings and card tags. */
export const IMPACT_LABEL: Record<Impact, string> = {
  high: "High impact",
  medium: "Medium impact",
  low: "Low impact",
};

export const STATUS_LABEL: Record<ActionStatus, string> = {
  suggested: "Suggested",
  open: "Open",
  in_progress: "In progress",
  snoozed: "Snoozed",
  done: "Done",
  dismissed: "Dismissed",
};

export const EFFORT_LABEL = { small: "Small", medium: "Medium", large: "Large" } as const;

export const SOURCE_LABEL = {
  rule: "From scan",
  agent: "Suggested by the weekly analyst",
} as const;

/** Who made a change, in the card's history. */
export const ACTOR_LABEL: Record<ActionActor, string> = {
  owner: "You",
  scan: "Scan",
  agent: "Weekly analyst",
  system: "Harbour",
};

/** Status filter options, in menu order; the default comes first. */
export const STATUS_FILTER_LABEL: Record<ActionFilter["status"], string> = {
  active: "Open and in progress",
  suggested: "Suggested",
  snoozed: "Snoozed",
  done: "Done",
  dismissed: "Dismissed",
  all: "All statuses",
};

/** What the board says when a status filter matches nothing. */
export const EMPTY_MESSAGE: Record<ActionFilter["status"], string> = {
  active: "Nothing open. New actions arrive with each scan and the weekly report.",
  suggested: "No suggestions waiting. The weekly analyst suggests actions with each report.",
  snoozed: "Nothing snoozed.",
  done: "Nothing done yet.",
  dismissed: "Nothing dismissed.",
  all: "No actions yet. New actions arrive with each scan and the weekly report.",
};

/** One status button: its label, the status it moves to, and what is announced after. */
export type StatusControl = { label: string; to: OwnerChange["to"]; done: string };

const DONE: StatusControl = { label: "Mark done", to: "done", done: "Marked done" };
const SNOOZE: StatusControl = { label: "Snooze…", to: "snoozed", done: "Snoozed" };
const DISMISS: StatusControl = { label: "Dismiss", to: "dismissed", done: "Dismissed" };

/** The owner's buttons per status: exactly the transitions the server allows. */
export const STATUS_CONTROLS: Record<ActionStatus, readonly StatusControl[]> = {
  suggested: [
    { label: "Accept", to: "open", done: "Accepted" },
    { label: "Reject", to: "dismissed", done: "Rejected" },
  ],
  open: [{ label: "Start", to: "in_progress", done: "Started" }, DONE, SNOOZE, DISMISS],
  in_progress: [
    { label: "Back to open", to: "open", done: "Moved back to open" },
    DONE,
    SNOOZE,
    DISMISS,
  ],
  snoozed: [{ label: "Wake now", to: "open", done: "Woken up" }, DONE, DISMISS],
  done: [{ label: "Reopen", to: "open", done: "Reopened" }],
  dismissed: [{ label: "Restore", to: "open", done: "Restored" }],
};
