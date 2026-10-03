import { BOARD_COLUMNS, type BoardColumnId } from "@/lib/actions/board-column";
import type { Board, BoardCard } from "@/lib/actions/board-view";
import type { WorkStrip } from "@/lib/today/work-strip";

// Fictional board cards and Today strips for /design: nothing here is read from or sent anywhere.

/** The clock the example last-move lines are worded against. */
export const BOARD_EXAMPLE_NOW = new Date("2026-10-02T09:00:00Z");
const HOUR = 3_600_000;

type Card = Partial<BoardCard> & Pick<BoardCard, "id" | "title" | "column">;

function card(over: Card): BoardCard {
  const column = over.column;
  return {
    whyLine: "Search results show the address instead of a name.",
    productId: "acme-docs",
    productName: "Acme Docs",
    area: "SEO",
    impact: "medium",
    effort: "small",
    who: "you",
    prUrl: null,
    lastMove: column
      ? {
          actor: "owner",
          to: column,
          at: new Date(BOARD_EXAMPLE_NOW.getTime() - 26 * HOUR),
          added: false,
        }
      : null,
    stuck: false,
    needsOwner: false,
    isNewIdea: false,
    status: "open",
    snoozedUntil: null,
    ...over,
  };
}

const CARDS: BoardCard[] = [
  card({ id: 201, title: "Write a meta description for the pricing page", column: "backlog" }),
  card({
    id: 202,
    title: "Answer “how do I install Acme Docs?” on the setup page",
    column: "backlog",
    area: "GEO",
    who: "undecided",
    status: "suggested",
    isNewIdea: true,
    needsOwner: true,
    lastMove: null,
  }),
  card({ id: 203, title: "Add a title to the pricing page", column: "queue", impact: "high" }),
  card({
    id: 204,
    title: "Fix the broken link in the setup guide",
    column: "started",
    who: "claude",
    lastMove: {
      actor: "claude",
      to: "started",
      at: new Date(BOARD_EXAMPLE_NOW.getTime() - 3 * HOUR),
      added: false,
    },
  }),
  card({
    id: 205,
    title: "Add structured data to the changelog",
    column: "in_progress",
    area: "AEO",
    status: "in_progress",
    who: "you",
    stuck: true,
    needsOwner: true,
    lastMove: {
      actor: "owner",
      to: "in_progress",
      at: new Date(BOARD_EXAMPLE_NOW.getTime() - 9 * 24 * HOUR),
      added: false,
    },
  }),
  card({
    id: 206,
    title: "Shorten the home page title",
    column: "in_review",
    status: "in_progress",
    who: "pr_waiting",
    needsOwner: true,
    prUrl: "https://github.com/example/acme-docs/pull/7",
  }),
  card({
    id: 207,
    title: "Add alt text to the hero image",
    column: "done",
    status: "done",
    who: null,
  }),
  card({
    id: 208,
    title: "Rewrite the footer links",
    column: null,
    status: "snoozed",
    snoozedUntil: "2026-10-20",
    who: null,
  }),
];

/** A board with a card in every column, a stuck card, a new idea and a parked card. */
export function exampleBoard(): Board {
  const columns = Object.fromEntries(
    BOARD_COLUMNS.map((id) => [id, CARDS.filter((c) => c.column === id)]),
  ) as Board["columns"];
  const counts = Object.fromEntries(BOARD_COLUMNS.map((id) => [id, columns[id].length])) as Record<
    BoardColumnId,
    number
  >;
  const inColumns = CARDS.filter((c) => c.column !== null);
  const focusCounts = {
    stuck: inColumns.filter((c) => c.stuck).length,
    "needs-you": inColumns.filter((c) => c.needsOwner).length,
  };
  const parked = CARDS.filter((c) => c.column === null);
  return { columns, counts, focusCounts, parked, truncated: false };
}

const NAMES: Record<BoardColumnId, string> = {
  backlog: "Backlog",
  queue: "Queue",
  started: "Started",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

function strip(counts: number[], rest: Omit<WorkStrip, "tiles">): WorkStrip {
  return {
    tiles: BOARD_COLUMNS.map((column, i) => ({
      column,
      name: NAMES[column],
      count: counts[i] ?? 0,
      href: "/actions?view=board",
    })),
    ...rest,
  };
}

const STUCK_HREF = "/actions?view=board&focus=stuck";
const NEEDS_HREF = "/actions?view=board&focus=needs-you";

export const NORMAL_STRIP: WorkStrip = strip([5, 3, 1, 2, 1, 4], {
  stuck: { count: 0, href: STUCK_HREF },
  needsYou: { count: 2, href: NEEDS_HREF },
  movedToday: {
    count: 2,
    lastLine: "Claude moved “Fix the broken link in the setup guide” to Started.",
  },
});

const BUSY_STRIP: WorkStrip = strip([24, 9, 4, 6, 7, 18], {
  stuck: { count: 3, href: STUCK_HREF },
  needsYou: { count: 8, href: NEEDS_HREF },
  movedToday: { count: 6, lastLine: "You moved “Add a FAQ to the setup page” to Queue." },
});

const CLEAR_STRIP: WorkStrip = strip([0, 0, 0, 0, 0, 0], {
  stuck: { count: 0, href: STUCK_HREF },
  needsYou: { count: 0, href: NEEDS_HREF },
  movedToday: { count: 0, lastLine: null },
});

/** The Today strip in three states, for /design. */
export const EXAMPLE_STRIPS: { label: string; strip: WorkStrip }[] = [
  { label: "Today strip · a normal day", strip: NORMAL_STRIP },
  { label: "Today strip · a busy day", strip: BUSY_STRIP },
  { label: "Today strip · all clear", strip: CLEAR_STRIP },
];
