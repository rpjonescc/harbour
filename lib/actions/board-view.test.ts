import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { type BoardColumnId, columnTarget } from "./board-column";
import { type BoardFilter, loadBoard, parseActionsView, parseBoardFocus } from "./board-view";
import { moveToColumn } from "./move-to-column";
import { insertAction } from "./store";
import type { ActionActor, NewAction } from "./types";

const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "acme-shop", name: "Acme Shop" },
];
const NOW = new Date("2026-10-20T09:00:00Z");
const DAY = 24 * 3_600_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const ALL: BoardFilter = { productId: null, area: null };
const PR = "https://github.com/acme/widget/pull/42";

function setup() {
  const db = openTestDb();
  let n = 0;
  /** A card in `column`, created `age` days ago by `actor`, its last change then too. */
  const seed = (
    column: BoardColumnId,
    over: Partial<NewAction> & { age?: number; actor?: ActionActor; prUrl?: string } = {},
  ) => {
    const { age = 1, actor = "scan", prUrl, ...rest } = over;
    const id = insertAction(
      db,
      ruleAction({ ruleKey: `rule-${++n}`, title: `Card ${n}`, ...columnTarget(column), ...rest }),
      actor,
      null,
      daysAgo(age),
    );
    if (prUrl) db.update(actions).set({ prUrl }).where(eq(actions.id, id)).run();
    return id;
  };
  const idea = (title = "New idea") =>
    insertAction(
      db,
      agentAction(analystJob(db), title, { ...columnTarget("backlog"), status: "suggested" }),
      "agent",
      null,
      daysAgo(1),
    );
  const load = (filter: BoardFilter = ALL) => loadBoard(db, filter, NOW, PRODUCTS);
  const titles = (cards: { title: string }[]) => cards.map((c) => c.title);
  return { db, seed, idea, load, titles };
}

describe("loadBoard columns", () => {
  it("puts each card in the column boardColumn gives it, with counts", () => {
    const { seed, load } = setup();
    seed("backlog");
    seed("queue");
    seed("queue");
    seed("started");
    seed("in_progress");
    seed("in_review");
    seed("done");
    const board = load();
    expect(board.counts).toEqual({
      backlog: 1,
      queue: 2,
      started: 1,
      in_progress: 1,
      in_review: 1,
      done: 1,
    });
    expect(board.columns.queue).toHaveLength(2);
    expect(board.truncated).toBe(false);
  });

  it("reads an in-progress card with a pull request as In review", () => {
    const { seed, load } = setup();
    seed("in_progress", { prUrl: PR });
    const board = load();
    expect(board.columns.in_review.map((c) => c.prUrl)).toEqual([PR]);
    expect(board.columns.in_progress).toEqual([]);
  });

  it("sorts by impact, then oldest first", () => {
    const { seed, load, titles } = setup();
    seed("queue", { title: "low old", impact: "low", age: 9 });
    seed("queue", { title: "high new", impact: "high", age: 1 });
    seed("queue", { title: "high old", impact: "high", age: 5 });
    seed("queue", { title: "medium", impact: "medium", age: 3 });
    expect(titles(load().columns.queue)).toEqual(["high old", "high new", "medium", "low old"]);
  });

  it("fills a card from the row: plain fields, the product's name and the why line", () => {
    const { seed, load } = setup();
    seed("queue", { why: "Pages without a description get a generated snippet. More text." });
    const [card] = load().columns.queue;
    expect(card).toMatchObject({
      productId: "acme-docs",
      productName: "Acme Docs",
      area: "SEO",
      impact: "medium",
      effort: "small",
      whyLine: "Pages without a description get a generated snippet.",
      column: "queue",
      prUrl: null,
      isNewIdea: false,
    });
  });

  it("skips cards of products that are not configured", () => {
    const { seed, load } = setup();
    seed("queue", { productId: "gone" });
    seed("queue");
    const board = load();
    expect(board.columns.queue).toHaveLength(1);
    expect(board.counts.queue).toBe(1);
  });
});

describe("loadBoard filters", () => {
  it("filters by product and by area", () => {
    const { seed, load, titles } = setup();
    seed("queue", { title: "docs seo", productId: "acme-docs", area: "SEO" });
    seed("queue", { title: "docs geo", productId: "acme-docs", area: "GEO" });
    seed("queue", { title: "shop seo", productId: "acme-shop", area: "SEO" });
    expect(titles(load({ productId: "acme-shop", area: null }).columns.queue)).toEqual([
      "shop seo",
    ]);
    expect(titles(load({ productId: null, area: "GEO" }).columns.queue)).toEqual(["docs geo"]);
    expect(load({ productId: "acme-docs", area: "SEO" }).counts.queue).toBe(1);
  });

  it("parses the focus and view params, ignoring anything else", () => {
    expect(parseBoardFocus("stuck")).toBe("stuck");
    expect(parseBoardFocus("needs-you")).toBe("needs-you");
    expect(parseBoardFocus("other")).toBeNull();
    expect(parseBoardFocus(["stuck", "stuck"])).toBeNull();
    expect(parseBoardFocus(undefined)).toBeNull();
    expect(parseActionsView("list")).toBe("list");
    expect(parseActionsView("board")).toBe("board");
    expect(parseActionsView(undefined)).toBe("board");
    expect(parseActionsView(["list", "list"])).toBe("board");
  });
});

describe("stuck", () => {
  it.each([
    ["started", 7, 8],
    ["in_progress", 7, 8],
    ["in_review", 3, 4],
  ] as const)("%s: exactly %i days is not stuck, %i days is", (column, fine, stuck) => {
    const { seed, load } = setup();
    seed(column, { title: "boundary", age: fine });
    seed(column, { title: "over", age: stuck });
    const cards = load().columns[column];
    const flag = (title: string) => cards.find((c) => c.title === title)?.stuck;
    expect([flag("boundary"), flag("over")]).toEqual([false, true]);
  });

  it("counts whole days: 7 days and 23 hours is not stuck", () => {
    const { seed, load } = setup();
    seed("started", { age: 7.99 });
    expect(load().columns.started[0]?.stuck).toBe(false);
  });

  it("never marks Backlog, Queue or Done as stuck", () => {
    const { seed, load } = setup();
    seed("backlog", { age: 12 });
    seed("queue", { age: 12 });
    seed("done", { age: 12 });
    const board = load();
    const flags = [...board.columns.backlog, ...board.columns.queue, ...board.columns.done];
    expect(flags.map((c) => c.stuck)).toEqual([false, false, false]);
  });

  it("measures from the latest move, not from creation", () => {
    const { db, seed, load } = setup();
    const id = seed("queue", { age: 20 });
    moveToColumn(db, {
      id,
      from: "queue",
      to: "in_progress",
      actor: "owner",
      login: "owner@example.com",
      productIds: ["acme-docs"],
      now: daysAgo(2),
    });
    expect(load().columns.in_progress[0]?.stuck).toBe(false);
  });

  it("focus=stuck keeps only stuck cards and hides parked ones", () => {
    const { seed, load, titles } = setup();
    seed("in_progress", { title: "stuck one", age: 9 });
    seed("in_progress", { title: "fresh", age: 1 });
    seed("queue", { title: "queued", age: 30 });
    seed("queue", { title: "asleep", status: "snoozed", snoozedUntil: "2026-11-01", stage: null });
    const board = load({ ...ALL, focus: "stuck" });
    expect(titles(board.columns.in_progress)).toEqual(["stuck one"]);
    expect(board.columns.queue).toEqual([]);
    expect(board.parked).toEqual([]);
    expect(board.counts.in_progress).toBe(2);
  });
});

describe("needsOwner", () => {
  it("is true for a new idea", () => {
    const { idea, load } = setup();
    idea();
    const [card] = load().columns.backlog;
    expect(card).toMatchObject({ isNewIdea: true, needsOwner: true, who: "undecided" });
  });

  it("is true for a pull request waiting for the owner's OK", () => {
    const { seed, load } = setup();
    seed("in_review", { prUrl: PR, actor: "claude" });
    expect(load().columns.in_review[0]).toMatchObject({ who: "pr_waiting", needsOwner: true });
  });

  it("is true for work the owner has started, in progress or in review", () => {
    const { seed, load } = setup();
    seed("started", { actor: "owner" });
    seed("in_progress", { actor: "owner" });
    seed("in_review", { actor: "owner" });
    const board = load();
    const flags = [board.columns.started, board.columns.in_progress, board.columns.in_review];
    expect(flags.map((cards) => cards[0]?.needsOwner)).toEqual([true, true, true]);
  });

  it("is false for work Claude is on, and for waiting Backlog, Queue and Done cards", () => {
    const { seed, load } = setup();
    seed("started", { actor: "claude" });
    seed("in_progress", { actor: "claude" });
    seed("backlog");
    seed("queue");
    seed("done");
    const board = load();
    const all = Object.values(board.columns).flat();
    expect(all.map((c) => c.needsOwner)).toEqual(all.map(() => false));
  });

  it("focus=needs-you keeps only those cards", () => {
    const { seed, idea, load, titles } = setup();
    idea("idea");
    seed("backlog", { title: "plain" });
    seed("in_progress", { title: "claude", actor: "claude" });
    seed("in_progress", { title: "mine", actor: "owner" });
    const board = load({ ...ALL, focus: "needs-you" });
    expect(titles(board.columns.backlog)).toEqual(["idea"]);
    expect(titles(board.columns.in_progress)).toEqual(["mine"]);
  });
});

describe("new ideas", () => {
  it("flags a suggested card in Backlog and nothing else", () => {
    const { seed, idea, load } = setup();
    idea();
    seed("backlog");
    expect(
      load()
        .columns.backlog.map((c) => c.isNewIdea)
        .sort(),
    ).toEqual([false, true]);
  });
});

describe("done and parked", () => {
  it("shows Done cards from the last 14 days, including exactly 14", () => {
    const { seed, load, titles } = setup();
    seed("done", { title: "13 days", age: 13 });
    seed("done", { title: "14 days", age: 14 });
    seed("done", { title: "15 days", age: 15 });
    const board = load();
    expect(titles(board.columns.done).sort()).toEqual(["13 days", "14 days"]);
    expect(board.counts.done).toBe(2);
    expect(board.truncated).toBe(false);
  });

  it("puts snoozed and dismissed cards in parked, not in a column", () => {
    const { seed, load, titles } = setup();
    seed("queue", { title: "asleep", status: "snoozed", snoozedUntil: "2026-11-01", stage: null });
    seed("queue", { title: "dismissed", status: "dismissed", stage: null });
    seed("queue", { title: "dismissed long ago", status: "dismissed", stage: null, age: 30 });
    const board = load();
    expect(titles(board.parked).sort()).toEqual(["asleep", "dismissed"]);
    expect(Object.values(board.columns).flat()).toEqual([]);
    const [asleep] = board.parked.filter((c) => c.title === "asleep");
    expect(asleep).toMatchObject({
      column: null,
      status: "snoozed",
      snoozedUntil: "2026-11-01",
      who: null,
      lastMove: null,
      stuck: false,
      needsOwner: false,
    });
  });
});

describe("lastMove", () => {
  it("reports the latest column move: who, where to, when", () => {
    const { db, seed, load } = setup();
    const id = seed("backlog", { age: 10 });
    moveToColumn(db, {
      id,
      from: "backlog",
      to: "queue",
      actor: "claude",
      note: "Next up",
      login: "claude",
      productIds: ["acme-docs"],
      now: daysAgo(2),
    });
    const [card] = load().columns.queue;
    expect(card?.lastMove).toEqual({ actor: "claude", to: "queue", at: daysAgo(2) });
    expect(card?.who).toBe("you");
  });

  it("reads Claude's move into In progress as Claude being on it", () => {
    const { db, seed, load } = setup();
    const id = seed("queue", { age: 4 });
    moveToColumn(db, {
      id,
      from: "queue",
      to: "in_progress",
      actor: "claude",
      note: "Starting",
      login: "claude",
      productIds: ["acme-docs"],
      now: daysAgo(1),
    });
    expect(load().columns.in_progress[0]).toMatchObject({
      who: "claude",
      lastMove: { actor: "claude", to: "in_progress" },
    });
  });

  it("falls back to the creation event for a card nobody moved", () => {
    const { seed, load } = setup();
    seed("backlog", { age: 3, actor: "scan" });
    expect(load().columns.backlog[0]?.lastMove).toEqual({
      actor: "scan",
      to: "backlog",
      at: daysAgo(3),
    });
  });

  it("names In review for a card whose pull request put it there", () => {
    const { seed, load } = setup();
    seed("in_progress", { prUrl: PR, age: 2 });
    expect(load().columns.in_review[0]?.lastMove?.to).toBe("in_review");
  });
});
