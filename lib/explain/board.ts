import type { BoardColumnId } from "@/lib/actions/board-column";
import { MOVE_REFUSAL } from "@/lib/actions/move-refusal";
import type { ActionActor } from "@/lib/actions/types";
import { plural } from "@/lib/scan/scoring/sub-score";
import type { WhoOnIt } from "./actions";

/** Where the sentences for a refused move live: the move logic needs no wording layer. */
export { MOVE_REFUSAL };

/**
 * Whole days a card may stand still in a column before the board calls it stuck: more than this
 * many (exactly 7 is fine, 8 is stuck). Columns without an entry are never stuck.
 */
export const STUCK_DAYS = { started: 7, in_progress: 7, in_review: 3 } as const;

/** What the wording needs to know about a card; the board's `BoardCard` fits it. */
export type CardState = {
  who: WhoOnIt | null;
  prUrl: string | null;
  isNewIdea: boolean;
  stuck: boolean;
};

type ColumnCopy = {
  name: string;
  /** The one line that is always visible under the column name. */
  short: string;
  /** The four parts behind "What's this?". */
  explainer: { what: string; whoMoves: string; next: string; ifStuck: string };
  /** One sentence: what this card is waiting on. */
  waitingOn: (card: CardState) => string;
  /** One sentence: what happens next, or what to do. */
  whatNext: (card: CardState) => string;
};

const count = (n: number, word: string) => `${n} ${plural(n, word)}`;

type StuckColumn = keyof typeof STUCK_DAYS;

const stoodStill = (column: StuckColumn) =>
  `Nothing has changed for more than ${count(STUCK_DAYS[column], "day")}.`;

/** Who has the card, for the two columns where work is under way. */
function onIt(card: CardState): string {
  return card.who === "claude" ? "Claude is working on it." : "Waiting for you to carry on.";
}

/** Wording for a column where a card can get stuck: the stuck sentence wins when it applies. */
function workColumn(
  column: StuckColumn,
  nextWhenOk: string,
): Pick<ColumnCopy, "waitingOn" | "whatNext"> {
  return {
    waitingOn: (card) => (card.stuck ? stoodStill(column) : onIt(card)),
    whatNext: (card) => (card.stuck ? "Check in on it, or move it back to Queue." : nextWhenOk),
  };
}

/** The plain wording for each board column (spec section 4); nothing here is a stored value. */
export const COLUMN_COPY: Readonly<Record<BoardColumnId, ColumnCopy>> = {
  backlog: {
    name: "Backlog",
    short: "Ideas and jobs nobody has picked yet.",
    explainer: {
      what: "Ideas and jobs nobody has picked yet. New ideas from the weekly review start here.",
      whoMoves: "You decide. Claude can move a card out too, and says why.",
      next: "Pick the ones worth doing and move them to Queue.",
      ifStuck: "A long list is fine. If a card will never be worth doing, dismiss it.",
    },
    waitingOn: (card) =>
      card.isNewIdea
        ? "Waiting for you to accept or dismiss it."
        : "Waiting for someone to pick it up.",
    whatNext: (card) =>
      card.isNewIdea
        ? "Accept it to keep it, or dismiss it."
        : "Move it to Queue when you want it done soon.",
  },
  queue: {
    name: "Queue",
    short: "Decided, and next up.",
    explainer: {
      what: "Jobs you have decided to do. They are next up.",
      whoMoves: "You or Claude move a card here once it is decided.",
      next: "Someone picks up the next job and moves it to Started.",
      ifStuck: "If a job sits here for weeks, move it back to Backlog or dismiss it.",
    },
    waitingOn: () => "Waiting for someone to start it.",
    whatNext: () => "Next, someone starts it.",
  },
  started: {
    name: "Started",
    short: "Someone has begun.",
    explainer: {
      what: "Work that someone has just begun.",
      whoMoves: "You or Claude move a card here when work begins.",
      next: "Once the work is well under way, it moves to In progress.",
      ifStuck: `After ${count(STUCK_DAYS.started, "day")} with no change the card says it is stuck. Check in on it, or move it back to Queue.`,
    },
    ...workColumn("started", "Next, the work moves to In progress."),
  },
  in_progress: {
    name: "In progress",
    short: "Being worked on now.",
    explainer: {
      what: "Work that is going on right now.",
      whoMoves: "You or Claude move a card here once the work is well under way.",
      next: "When a pull request opens, the card moves to In review. Work with no code goes straight to Done.",
      ifStuck: `After ${count(STUCK_DAYS.in_progress, "day")} with no change the card says it is stuck. Find out what is blocking it, or move it back to Queue.`,
    },
    ...workColumn("in_progress", "Next, it goes to In review, or to Done."),
  },
  in_review: {
    name: "In review",
    short: "Finished, and waiting for a look.",
    explainer: {
      what: "Work is finished and waiting for a look. That is usually a pull request.",
      whoMoves: "A card lands here when a pull request is linked. You can also move it by hand.",
      next: "You look it over. Good work is merged, and the card moves to Done.",
      ifStuck: `After ${count(STUCK_DAYS.in_review, "day")} with no change the card says it is stuck. Open the pull request and decide, or ask for changes.`,
    },
    waitingOn: (card) => {
      if (card.stuck) return stoodStill("in_review");
      return card.prUrl
        ? "Waiting for your OK on the pull request."
        : "Waiting for a look. No pull request is linked yet.";
    },
    whatNext: (card) =>
      card.prUrl
        ? "Read the pull request. Merge it if it looks good."
        : "Link the pull request when there is one.",
  },
  done: {
    name: "Done",
    short: "Finished in the last 14 days.",
    explainer: {
      what: "Jobs that are finished. This column shows the last 14 days.",
      whoMoves: "You or Claude move a card here once the work is merged or checked.",
      next: "Nothing. The next check shows whether the problem is gone.",
      ifStuck: "Nothing to unstick. If the problem comes back, a new card opens in Backlog.",
    },
    waitingOn: () => "Nothing. This is finished.",
    whatNext: () => "Nothing more to do.",
  },
};

const MOVER: Readonly<Record<ActionActor, string>> = {
  owner: "You",
  claude: "Claude",
  scan: "A check",
  agent: "The weekly review",
  system: "Harbour",
};

const HOUR = 3_600_000;

function ago(at: Date, now: Date): string {
  const hours = Math.floor((now.getTime() - at.getTime()) / HOUR);
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${count(hours, "hour")} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "Claude moved this to Queue, 2 days ago": the latest move on a card. */
export function lastMoveLine(
  move: { actor: ActionActor; to: BoardColumnId; at: Date },
  now: Date,
): string {
  return `${MOVER[move.actor]} moved this to ${COLUMN_COPY[move.to].name}, ${ago(move.at, now)}`;
}

/** Headings for the four parts behind a column's "What's this?". */
const PART_LABELS: Readonly<Record<keyof ColumnCopy["explainer"], string>> = {
  what: "What it means",
  whoMoves: "Who moves cards here",
  next: "What usually happens next",
  ifStuck: "If a card is stuck",
};

const PART_ORDER = ["what", "whoMoves", "next", "ifStuck"] as const;

/** A column's four parts with their headings, in order, for the `Explainer`. */
export function explainerItems(
  explainer: ColumnCopy["explainer"],
): { label: string; text: string }[] {
  return PART_ORDER.map((part) => ({ label: PART_LABELS[part], text: explainer[part] }));
}

/** The quiet strip under the board for snoozed and dismissed cards. */
export const PARKED_COPY: Pick<ColumnCopy, "name" | "short" | "explainer"> & { empty: string } = {
  name: "Parked",
  short: "Snoozed cards, and cards dismissed in the last 14 days.",
  explainer: {
    what: "Cards put aside for now. They are not in any column.",
    whoMoves: "You, by snoozing or dismissing a card.",
    next: "A snoozed card comes back to Backlog on its date. A dismissed card stays here for 14 days, then drops off.",
    ifStuck: "Bring a card back whenever you want it on the board again.",
  },
  empty: "Nothing is parked.",
};

/** The rest of the board's wording: view switch, card labels, moves and notes. */
export const BOARD_TEXT = {
  view: "View",
  board: "Board",
  list: "List",
  moveTo: "Move to…",
  newIdea: "New idea",
  stuck: "Stuck",
  emptyColumn: "No cards here.",
  moveFailed: "That move wasn't saved. Try again in a moment.",
  /** The region name for a column: "Queue, 3 cards". */
  columnLabel: (column: BoardColumnId, n: number) =>
    `${COLUMN_COPY[column].name}, ${count(n, "card")}`,
  /** The menu's name: "Move Fix the title to". */
  moveMenu: (title: string) => `Move ${title} to`,
  moved: (title: string, column: BoardColumnId) => `Moved ${title} to ${COLUMN_COPY[column].name}`,
  truncated: (max: number) =>
    `The board shows ${max} cards at most, so some are not here. Use the filters to narrow it.`,
  technical: { id: "Card number", status: "Stored status", column: "Column id" },
} as const;

/** The Today "Where the work is" band: every sentence, so a quiet board still says something. */
export const STRIP_TEXT = {
  heading: "Where the work is",
  oneLiner: "Every job by column. Pick a column to open it on the board.",
  explainer: [
    {
      label: "What it shows",
      text: "How many jobs sit in each column of the board, and the bar shows how they are spread.",
    },
    {
      label: "What stuck means",
      text: `A job is stuck when nothing has changed for more than ${count(STUCK_DAYS.started, "day")} (${count(STUCK_DAYS.in_review, "day")} in review).`,
    },
    {
      label: "What needs you",
      text: "New ideas to decide, pull requests waiting for a look, and work that is yours to carry on.",
    },
  ],
  openBoard: "Open the board",
  nothingYet: "No jobs are on the board yet. They appear after the next check.",
  /** The tile's name for a column: "Queue: 3 cards". */
  columnTile: (column: BoardColumnId, n: number) => `${COLUMN_COPY[column].name}: ${cards(n)}`,
  cards,
  stuckTitle: "Stuck",
  stuck: (n: number) =>
    n === 0
      ? "Nothing is stuck."
      : `${count(n, "job")} ${n === 1 ? "has" : "have"} stood still for too long.`,
  stuckLink: "See the stuck jobs",
  needsTitle: "Needs you",
  needs: (n: number) =>
    n === 0
      ? "Nothing needs you right now."
      : `${count(n, "job")} ${n === 1 ? "is" : "are"} waiting for you.`,
  needsLink: "See what needs you",
  needsMore: (n: number) => `${n} more on the board.`,
  moved: (n: number) => (n === 0 ? "Nothing has moved today." : `${count(n, "job")} moved today.`),
} as const;

function cards(n: number): string {
  return n === 0 ? "no cards" : count(n, "card");
}

/** "Claude moved “Fix the title” to Queue": the latest move of the day, on Today. */
export function movedTodayLine(move: {
  actor: ActionActor;
  title: string;
  to: BoardColumnId | null;
}): string {
  const where = move.to ? COLUMN_COPY[move.to].name : "Parked";
  return `${MOVER[move.actor]} moved “${move.title}” to ${where}.`;
}

/** The "Needs you" line for a card: its title and what it is waiting on. */
export function needsYouLine(title: string, column: BoardColumnId, card: CardState): string {
  return `${title}. ${COLUMN_COPY[column].waitingOn(card)}`;
}

/** The note on /actions while the Today strip's `?focus=` is on: what is filtered, and how to clear it. */
export const FOCUS_TEXT = {
  stuck: "Showing only the stuck jobs.",
  "needs-you": "Showing only the jobs that need you.",
  clear: "Show everything",
} as const;
