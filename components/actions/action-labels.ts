import type { StatusChange } from "@/lib/actions/transitions";
import type { ActionActor, ActionStatus } from "@/lib/actions/types";
import type { ActionFilter } from "@/lib/actions/views";
import { STATUS_COLUMN } from "@/lib/explain/actions";

/** Where an action came from, in Technical details. */
export const SOURCE_LABEL = {
  rule: "Found by a check",
  agent: "Suggested by the weekly report",
  manual: "Added by hand by Claude",
} as const;

/** Who made a change, in the card's history. */
export const ACTOR_LABEL: Record<ActionActor, string> = {
  owner: "You",
  claude: "Claude",
  scan: "Harbour's check",
  agent: "Weekly report",
  system: "Harbour",
};

/**
 * Status filter options, in menu order; the default comes first. URL values stay the stored
 * statuses.
 */
export const STATUS_FILTER_LABEL: Record<ActionFilter["status"], string> = {
  active: `${STATUS_COLUMN.open} and in progress`,
  suggested: STATUS_COLUMN.suggested,
  snoozed: STATUS_COLUMN.snoozed,
  done: STATUS_COLUMN.done,
  dismissed: STATUS_COLUMN.dismissed,
  all: "Everything",
};

/** What the board says when a filter matches nothing: what appears here, when, and why. */
export const EMPTY_STATE: Record<
  ActionFilter["status"],
  { what: string; when: string; why: string }
> = {
  active: {
    what: "Nothing to do right now.",
    when: "New things show up after each check and each weekly report.",
    why: "New ideas you haven't decided on yet are under the New ideas filter.",
  },
  suggested: {
    what: "No new ideas waiting.",
    when: "The weekly report adds ideas, on Sundays.",
    why: "You decide which ones to accept.",
  },
  snoozed: {
    what: "Nothing is snoozed.",
    when: "A snoozed item comes back on the date you pick.",
    why: "You can snooze anything on the board.",
  },
  done: {
    what: "Nothing is done yet.",
    when: "Finished items, and problems a check no longer finds, appear here.",
    why: "They stay so you can see what changed.",
  },
  dismissed: {
    what: "Nothing is dismissed.",
    when: "Items you dismiss appear here.",
    why: "You can bring any of them back.",
  },
  all: {
    what: "No actions yet.",
    when: "They arrive after each check and each weekly report.",
    why: "Run Check now on a product page to get the first ones.",
  },
};

/** One status button: its label, the status it moves to, and what is announced after. */
export type StatusControl = { label: string; to: StatusChange["to"]; done: string };

const DONE: StatusControl = { label: "Mark done", to: "done", done: "Marked done" };
const SNOOZE: StatusControl = { label: "Snooze…", to: "snoozed", done: "Snoozed" };
const DISMISS: StatusControl = { label: "Dismiss", to: "dismissed", done: "Dismissed" };
/** An open action sits in Backlog; the column name comes from lib/explain. */
const BACKLOG = STATUS_COLUMN.open;
const BACK: StatusControl = {
  label: `Move back to ${BACKLOG}`,
  to: "open",
  done: `Moved back to ${BACKLOG}`,
};

/** The owner's buttons per status: exactly the transitions the server allows. */
export const STATUS_CONTROLS: Record<ActionStatus, readonly StatusControl[]> = {
  suggested: [{ label: "Accept", to: "open", done: `Accepted, now in ${BACKLOG}` }, DISMISS],
  open: [{ label: "Start", to: "in_progress", done: "Started" }, DONE, SNOOZE, DISMISS],
  in_progress: [BACK, DONE, SNOOZE, DISMISS],
  snoozed: [
    { label: "Bring back now", to: "open", done: `Brought back to ${BACKLOG}` },
    DONE,
    DISMISS,
  ],
  done: [BACK],
  dismissed: [{ label: `Restore to ${BACKLOG}`, to: "open", done: `Restored to ${BACKLOG}` }],
};
