import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { loadWorkStrip } from "@/lib/today/work-strip";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { type BoardColumnId, columnTarget } from "./board-column";
import { loadBoard } from "./board-view";
import { insertAction } from "./store";
import type { ActionActor, NewAction } from "./types";
import { MAX_BOARD_ACTIONS } from "./views";

const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs" }];
const NOW = new Date("2026-10-20T09:00:00Z");
const DAY = 24 * 3_600_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const ALL = { productId: null, area: null };
const PR = "https://github.com/acme/widget/pull/42";

function setup() {
  const db = openTestDb();
  let n = 0;
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
  /** More high-impact Backlog cards than the board shows, so low-impact work is past the cap. */
  const flood = () =>
    db.transaction((tx) => {
      for (let i = 0; i < MAX_BOARD_ACTIONS + 10; i++) {
        insertAction(
          tx,
          ruleAction({ ruleKey: `bulk-${i}`, impact: "high", ...columnTarget("backlog") }),
          "scan",
          null,
          daysAgo(1),
        );
      }
    });
  return { db, seed, flood };
}

describe("stuck and needs-you past the card cap", () => {
  it("Today counts every stuck card and every card that needs the owner", () => {
    const { seed, flood, db } = setup();
    flood();
    seed("in_progress", { impact: "low", age: 9, title: "stuck, mine" });
    seed("in_review", { impact: "low", actor: "claude", title: "review, no PR" });
    const strip = loadWorkStrip(db, NOW, "Europe/London", PRODUCTS);
    expect(strip.stuck.count).toBe(1);
    expect(strip.needsYou.count).toBe(2);
  });

  it("a focused board shows those cards", () => {
    const { seed, flood, db } = setup();
    flood();
    seed("in_progress", { impact: "low", age: 9, title: "stuck, mine" });
    const stuck = loadBoard(db, { ...ALL, focus: "stuck" }, NOW, PRODUCTS);
    expect(stuck.columns.in_progress.map((c) => c.title)).toEqual(["stuck, mine"]);
    expect(stuck.focusCounts).toEqual({ stuck: 1, "needs-you": 1 });
  });
});

describe("the SQL focus counts", () => {
  it("agree with each loaded card's stuck and needs-you flags", () => {
    const { seed, db } = setup();
    const job = analystJob(db);
    insertAction(
      db,
      agentAction(job, "An idea", { ...columnTarget("backlog"), status: "suggested" }),
      "agent",
      null,
      daysAgo(1),
    );
    for (const column of ["backlog", "queue", "done"] as const) seed(column, { age: 30 });
    for (const column of ["started", "in_progress"] as const) {
      for (const actor of ["owner", "claude"] as const) {
        for (const age of [1, 7, 8]) seed(column, { actor, age });
      }
    }
    seed("started", { actor: "claude", prUrl: PR });
    for (const age of [3, 4]) {
      seed("in_review", { actor: "claude", age });
      seed("in_progress", { actor: "owner", age, prUrl: PR });
    }
    const board = loadBoard(db, ALL, NOW, PRODUCTS);
    const cards = Object.values(board.columns).flat();
    expect(board.focusCounts).toEqual({
      stuck: cards.filter((c) => c.stuck).length,
      "needs-you": cards.filter((c) => c.needsOwner).length,
    });
    for (const focus of ["stuck", "needs-you"] as const) {
      const focused = Object.values(loadBoard(db, { ...ALL, focus }, NOW, PRODUCTS).columns).flat();
      const flag = focus === "stuck" ? "stuck" : "needsOwner";
      expect(focused.map((c) => c.id).sort()).toEqual(
        cards
          .filter((c) => c[flag])
          .map((c) => c.id)
          .sort(),
      );
    }
  });
});
