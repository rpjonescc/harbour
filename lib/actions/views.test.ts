import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions, brainDocs } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { activeWork } from "./active-work";
import { linkPullRequest } from "./pr-link";
import { lastStatusActor } from "./status-actor";
import { insertAction, MAX_ACTION_EVENTS, setStatus } from "./store";
import type { ActionStatus, NewAction } from "./types";
import {
  type ActionFilter,
  type ActionGroup,
  actionCounts,
  boardActions,
  MAX_BOARD_ACTIONS,
  openActionCount,
  parseActionFilter,
  ruleActionStatuses,
  topActiveActions,
} from "./views";

const PRODUCTS = ["acme-docs", "acme-shop"] as const;
const t0 = new Date("2026-10-02T09:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const ACTIVE_ALL = { productId: null, area: null, status: "active" } as const;

let minute = 0;
function add(db: Db, over: Partial<NewAction>, key = `rule-${minute}`): number {
  minute += 1;
  return insertAction(db, ruleAction({ ruleKey: key, ...over }), "scan", null, at(minute));
}

const titles = (groups: ActionGroup[]) =>
  groups.map((g) => [g.impact, g.actions.map((a) => a.title)]);

describe("boardActions", () => {
  beforeEach(() => {
    minute = 0;
  });

  it("groups high → low; in progress first, then small → large effort, then oldest", () => {
    const db = openTestDb();
    add(db, { title: "low", impact: "low" });
    add(db, { title: "high large", impact: "high", effort: "large" });
    add(db, { title: "high small old", impact: "high", effort: "small" });
    add(db, { title: "high small new", impact: "high", effort: "small" });
    add(db, { title: "high started", impact: "high", effort: "large", status: "in_progress" });
    add(db, { title: "medium", impact: "medium", effort: "medium" });
    expect(titles(boardActions(db, ACTIVE_ALL, PRODUCTS).groups)).toEqual([
      ["high", ["high started", "high small old", "high small new", "high large"]],
      ["medium", ["medium"]],
      ["low", ["low"]],
    ]);
  });

  it("filters by product, area and status, and hides unconfigured products", () => {
    const db = openTestDb();
    add(db, { title: "docs seo" });
    add(db, { title: "docs geo", area: "GEO" });
    add(db, { title: "shop seo", productId: "acme-shop" });
    add(db, { title: "gone", productId: "retired-product" });
    add(db, { title: "dismissed", status: "dismissed" });
    add(db, { title: "done", status: "done" });
    add(db, { title: "snoozed", status: "snoozed", snoozedUntil: "2026-10-09" });
    const job = analystJob(db);
    insertAction(db, agentAction(job, "suggested"), "agent", null, at(99));
    const list = (filter: Partial<ActionFilter>) =>
      boardActions(db, { ...ACTIVE_ALL, ...filter }, PRODUCTS)
        .groups.flatMap((g) => g.actions.map((a) => a.title))
        .sort();

    expect(list({})).toEqual(["docs geo", "docs seo", "shop seo"]);
    expect(list({ productId: "acme-shop" })).toEqual(["shop seo"]);
    expect(list({ productId: "retired-product" })).toEqual([]);
    expect(list({ area: "GEO" })).toEqual(["docs geo"]);
    expect(list({ status: "suggested" })).toEqual(["suggested"]);
    expect(list({ status: "snoozed" })).toEqual(["snoozed"]);
    expect(list({ status: "done" })).toEqual(["done"]);
    expect(list({ status: "dismissed" })).toEqual(["dismissed"]);
    expect(list({ status: "all" })).toEqual([
      "dismissed",
      "docs geo",
      "docs seo",
      "done",
      "shop seo",
      "snoozed",
      "suggested",
    ]);
  });

  it("leaves out empty groups and returns nothing without configured products", () => {
    const db = openTestDb();
    add(db, { title: "only", impact: "medium" });
    expect(titles(boardActions(db, ACTIVE_ALL, PRODUCTS).groups)).toEqual([["medium", ["only"]]]);
    expect(boardActions(db, ACTIVE_ALL, [])).toEqual({ groups: [], more: 0 });
  });

  it("shows at most MAX_BOARD_ACTIONS and counts the rest", () => {
    const db = openTestDb();
    for (let i = 0; i < MAX_BOARD_ACTIONS + 5; i += 1) {
      add(db, { title: `a${i}`, impact: i < 3 ? "high" : "low" });
    }
    const { groups, more } = boardActions(db, ACTIVE_ALL, PRODUCTS);
    expect(more).toBe(5);
    expect(groups.flatMap((g) => g.actions)).toHaveLength(MAX_BOARD_ACTIONS);
    expect(titles(groups)[0]).toEqual(["high", ["a0", "a1", "a2"]]);
    // The oldest low-impact actions are shown; the newest five are not.
    const shown = groups.flatMap((g) => g.actions.map((a) => a.title));
    expect(shown).toContain(`a${MAX_BOARD_ACTIONS - 1}`);
    expect(shown).not.toContain(`a${MAX_BOARD_ACTIONS}`);
  });

  it("lists done and dismissed actions by their latest status change, newest first", () => {
    const db = openTestDb();
    const first = add(db, { title: "done first", impact: "high", effort: "large" });
    const second = add(db, { title: "done second", impact: "high" });
    const third = add(db, { title: "done third", impact: "high" });
    setStatus(db, second, "open", "done", { actor: "owner", now: at(100) });
    setStatus(db, first, "open", "done", { actor: "owner", now: at(101) });
    setStatus(db, third, "open", "done", { actor: "owner", now: at(102) });
    const done = boardActions(db, { ...ACTIVE_ALL, status: "done" }, PRODUCTS);
    expect(titles(done.groups)).toEqual([["high", ["done third", "done first", "done second"]]]);
    expect(done.more).toBe(0);
  });

  it("carries the history and links only docs the brain has", () => {
    const db = openTestDb();
    db.insert(brainDocs)
      .values({ path: "research/seo/meta.md", title: "Meta", mtime: t0, contentHash: "h" })
      .run();
    const id = add(db, { docs: ["research/seo/meta.md", "research/seo/missing.md"] });
    setStatus(db, id, "open", "in_progress", { actor: "owner", note: "Starting", now: at(50) });
    const [view] = boardActions(db, ACTIVE_ALL, PRODUCTS).groups.flatMap((g) => g.actions);
    expect(view?.docLinks).toEqual([
      { path: "research/seo/meta.md", exists: true },
      { path: "research/seo/missing.md", exists: false },
    ]);
    expect(view?.events.map(({ actor, from, to, note }) => ({ actor, from, to, note }))).toEqual([
      { actor: "scan", from: null, to: "open", note: null },
      { actor: "owner", from: "open", to: "in_progress", note: "Starting" },
    ]);
    expect(view?.historyTruncated).toBe(false);
    expect(view?.evidenceInvalid).toBe(false);
    expect(view?.docsInvalid).toBe(false);
  });

  it("says when older history was pruned", () => {
    const db = openTestDb();
    const id = add(db, {});
    for (let i = 0; i < MAX_ACTION_EVENTS; i += 1) {
      const [from, to]: [ActionStatus, ActionStatus] =
        i % 2 === 0 ? ["open", "in_progress"] : ["in_progress", "open"];
      setStatus(db, id, from, to, { actor: "owner", now: at(10 + i) });
    }
    const [view] = boardActions(db, { ...ACTIVE_ALL, status: "all" }, PRODUCTS).groups.flatMap(
      (g) => g.actions,
    );
    expect(view?.events).toHaveLength(MAX_ACTION_EVENTS);
    expect(view?.historyTruncated).toBe(true);
  });

  it("shows unreadable evidence and docs as gaps, not a crash", () => {
    const db = openTestDb();
    const id = add(db, {});
    db.update(actions)
      .set({
        evidence: { items: [{ text: "x", url: "javascript:alert(1)" }], total: 1 },
        docs: ["../secrets.md"],
      })
      .where(eq(actions.id, id))
      .run();
    const [view] = boardActions(db, ACTIVE_ALL, PRODUCTS).groups.flatMap((g) => g.actions);
    expect(view?.evidence).toEqual({ items: [], total: 0 });
    expect(view?.evidenceInvalid).toBe(true);
    expect(view?.docLinks).toEqual([]);
    expect(view?.docsInvalid).toBe(true);
  });
});

describe("counts and summaries", () => {
  function seed(db: Db) {
    add(db, { title: "a", impact: "low" });
    add(db, { title: "b", impact: "high", effort: "large" });
    add(db, { title: "c", impact: "high", status: "in_progress" });
    add(db, { title: "d", impact: "medium", productId: "acme-shop" });
    add(db, { title: "e", impact: "high", productId: "retired-product" });
    add(db, { title: "f", status: "done" });
    add(db, { title: "g", status: "snoozed", snoozedUntil: "2026-10-09" });
  }

  it("counts each status for configured products only", () => {
    const db = openTestDb();
    seed(db);
    expect(actionCounts(db, PRODUCTS)).toEqual({
      suggested: 0,
      open: 3,
      in_progress: 1,
      done: 1,
      snoozed: 1,
      dismissed: 0,
    });
    expect(openActionCount(db, PRODUCTS)).toBe(4);
    expect(openActionCount(db, [])).toBe(0);
  });

  it("lists the top active actions in board order and how many more there are", () => {
    const db = openTestDb();
    seed(db);
    const top = topActiveActions(db, PRODUCTS, 3);
    expect(top.actions.map((a) => a.title)).toEqual(["c", "b", "d"]);
    expect(top.more).toBe(1);
    expect(topActiveActions(db, PRODUCTS, 10)).toMatchObject({ more: 0 });
    expect(topActiveActions(db, PRODUCTS, 10).actions).toHaveLength(4);
    expect(topActiveActions(db, [], 3)).toEqual({ actions: [], more: 0 });
  });

  it("maps one product's rule keys to their action status", () => {
    const db = openTestDb();
    const open = add(db, {}, "missing-title");
    const snoozed = add(db, { status: "snoozed", snoozedUntil: "2026-10-09" }, "thin-content");
    add(db, { productId: "acme-shop" }, "missing-title");
    const job = analystJob(db);
    insertAction(db, agentAction(job, "agent idea"), "agent", null, at(99));
    expect(ruleActionStatuses(db, "acme-docs")).toEqual(
      new Map([
        ["missing-title", { id: open, status: "open", snoozedUntil: null }],
        ["thin-content", { id: snoozed, status: "snoozed", snoozedUntil: "2026-10-09" }],
      ]),
    );
  });
});

describe("parseActionFilter", () => {
  it("defaults to every configured product's active actions", () => {
    expect(parseActionFilter({}, PRODUCTS)).toEqual(ACTIVE_ALL);
  });

  it("reads product, area and status", () => {
    expect(
      parseActionFilter({ product: "acme-shop", area: "GEO", status: "snoozed" }, PRODUCTS),
    ).toEqual({ productId: "acme-shop", area: "GEO", status: "snoozed" });
    expect(parseActionFilter({ status: "all" }, PRODUCTS).status).toBe("all");
  });

  it("falls back to defaults for unknown or repeated values", () => {
    expect(
      parseActionFilter({ product: "retired-product", area: "seo", status: "open" }, PRODUCTS),
    ).toEqual(ACTIVE_ALL);
    expect(
      parseActionFilter({ product: ["acme-shop", "acme-docs"], area: ["GEO"] }, PRODUCTS),
    ).toEqual(ACTIVE_ALL);
  });
});

describe("boardActions who's on it", () => {
  beforeEach(() => {
    minute = 0;
  });

  it("reads each card's history as Today does", () => {
    const db = openTestDb();
    const claudes = add(db, { title: "claude's" });
    setStatus(db, claudes, "open", "in_progress", { actor: "claude", note: "On it", now: at(50) });
    const waiting = add(db, { title: "owner's, with a PR" });
    setStatus(db, waiting, "open", "in_progress", { actor: "owner", now: at(51) });
    linkPullRequest(db, {
      id: waiting,
      url: "https://github.com/example/site/pull/7",
      productIds: PRODUCTS,
      now: at(52),
    });
    add(db, { title: "plain open" });
    add(db, { title: "finished", status: "done" });

    const cards = boardActions(db, { ...ACTIVE_ALL, status: "all" }, PRODUCTS).groups.flatMap(
      (g) => g.actions,
    );
    expect(Object.fromEntries(cards.map((c) => [c.title, c.who]))).toEqual({
      "claude's": "claude",
      "owner's, with a PR": "pr_waiting",
      "plain open": "you",
      finished: null,
    });
    // The board's reading and activeWork's SQL agree for every active action.
    for (const work of activeWork(db, PRODUCTS)) {
      const card = cards.find((c) => c.id === work.id);
      expect(work.statusActor).toBe(lastStatusActor(card?.events ?? []));
    }
  });
});
