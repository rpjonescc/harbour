import type { Db } from "@/lib/db/client";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { activeWork } from "./active-work";
import { moveToColumn } from "./move-to-column";
import { linkPullRequest } from "./pr-link";
import { insertAction, MAX_ACTION_EVENTS, setStatus } from "./store";
import type { NewAction } from "./types";

const PRODUCTS = ["acme-docs", "acme-shop"];
const t0 = new Date("2026-10-02T09:00:00Z");
let minute = 0;
const at = () => new Date(t0.getTime() + ++minute * 60_000);
const add = (db: Db, over: Partial<NewAction>) =>
  insertAction(db, ruleAction({ ruleKey: `rule-${minute}`, ...over }), "scan", null, at());
const pr = (n: number) => `https://github.com/example/site/pull/${n}`;

describe("activeWork", () => {
  beforeEach(() => {
    minute = 0;
  });

  it("lists open and in-progress actions of configured products with who last moved them", () => {
    const db = openTestDb();
    const open = add(db, { title: "open" });
    const started = add(db, { title: "started" });
    setStatus(db, started, "open", "in_progress", { actor: "owner", now: at() });
    const claude = add(db, { title: "claude", area: "GEO", productId: "acme-shop" });
    setStatus(db, claude, "open", "in_progress", {
      actor: "claude",
      note: "Adding llms.txt",
      now: at(),
    });
    add(db, { title: "done", status: "done" });
    add(db, { title: "snoozed", status: "snoozed", snoozedUntil: "2026-10-09" });
    add(db, { title: "elsewhere", productId: "retired-product" });
    expect(activeWork(db, PRODUCTS)).toEqual([
      {
        id: open,
        productId: "acme-docs",
        area: "SEO",
        status: "open",
        prUrl: null,
        statusActor: "scan",
      },
      {
        id: started,
        productId: "acme-docs",
        area: "SEO",
        status: "in_progress",
        prUrl: null,
        statusActor: "owner",
      },
      {
        id: claude,
        productId: "acme-shop",
        area: "GEO",
        status: "in_progress",
        prUrl: null,
        statusActor: "claude",
      },
    ]);
    expect(activeWork(db, [])).toEqual([]);
  });

  // Regression: a PR link is an event from a status to itself, and each action must read its
  // own events (Drizzle's unqualified subquery columns would correlate on the wrong id).
  it("ignores a pull request link when finding who moved the status last", () => {
    const db = openTestDb();
    const mine = add(db, { title: "mine" });
    // Started: the link does not move the card, so it is no status change.
    setStatus(db, mine, "open", "in_progress", { actor: "owner", stage: "started", now: at() });
    const claudes = add(db, { title: "claude's" });
    setStatus(db, claudes, "open", "in_progress", { actor: "claude", note: "On it", now: at() });
    const linked = linkPullRequest(db, { id: mine, url: pr(7), productIds: PRODUCTS, now: at() });
    expect(linked).toMatchObject({ ok: true });
    expect(activeWork(db, PRODUCTS).map((w) => [w.id, w.statusActor, w.prUrl])).toEqual([
      [mine, "owner", pr(7)],
      [claudes, "claude", null],
    ]);
  });

  // Review Focus 1: only the newest MAX_ACTION_EVENTS events are kept.
  it("has no actor once pruning removed every status change", () => {
    const db = openTestDb();
    const id = add(db, { title: "busy" });
    const opts = { actor: "claude", note: "On it", stage: "started", now: at() } as const;
    setStatus(db, id, "open", "in_progress", opts);
    for (let i = 1; i <= MAX_ACTION_EVENTS / 2; i++) {
      linkPullRequest(db, { id, url: pr(i), productIds: PRODUCTS, now: at() });
      linkPullRequest(db, { id, url: null, productIds: PRODUCTS, now: at() });
    }
    expect(activeWork(db, PRODUCTS)).toEqual([
      {
        id,
        productId: "acme-docs",
        area: "SEO",
        status: "in_progress",
        prUrl: null,
        statusActor: null,
      },
    ]);
  });

  it("counts a board move within one status as the latest status change", () => {
    const db = openTestDb();
    const id = add(db, { title: "queued by Claude" });
    const moved = moveToColumn(db, {
      id,
      from: "backlog",
      to: "queue",
      actor: "claude",
      note: "Next up",
      login: "claude",
      productIds: PRODUCTS,
      now: at(),
    });
    expect(moved).toEqual({ ok: true });
    expect(activeWork(db, PRODUCTS).map((w) => w.statusActor)).toEqual(["claude"]);
  });
});
