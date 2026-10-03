import { eq } from "drizzle-orm";
import { type BoardColumnId, columnTarget } from "@/lib/actions/board-column";
import { moveToColumn } from "@/lib/actions/move-to-column";
import { insertAction } from "@/lib/actions/store";
import type { ActionActor, NewAction } from "@/lib/actions/types";
import { actions } from "@/lib/db/schema";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { loadWorkStrip } from "./work-strip";

const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs" }];
const NOW = new Date("2026-10-20T09:00:00Z");
const DAY = 24 * 3_600_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function setup() {
  const db = openTestDb();
  let n = 0;
  const seed = (
    column: BoardColumnId,
    over: Partial<NewAction> & { age?: number; actor?: ActionActor } = {},
  ) => {
    const { age = 1, actor = "scan", ...rest } = over;
    return insertAction(
      db,
      ruleAction({ ruleKey: `rule-${++n}`, title: `Card ${n}`, ...columnTarget(column), ...rest }),
      actor,
      null,
      daysAgo(age),
    );
  };
  const load = (now = NOW, zone = "Europe/London") => loadWorkStrip(db, now, zone, PRODUCTS);
  return { db, seed, load };
}

describe("loadWorkStrip", () => {
  it("is quiet on an empty board", () => {
    const strip = setup().load();
    expect(strip.tiles.map((t) => t.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(strip.stuck.count).toBe(0);
    expect(strip.needsYou).toEqual({ count: 0, href: "/actions?view=board&focus=needs-you" });
    expect(strip.movedToday).toEqual({ count: 0, lastLine: null });
  });

  it("counts each column from the real totals and links to the board", () => {
    const { seed, load } = setup();
    seed("backlog");
    seed("queue");
    seed("queue");
    seed("in_review");
    seed("done");
    const strip = load();
    expect(strip.tiles.map((t) => [t.column, t.name, t.count])).toEqual([
      ["backlog", "Backlog", 1],
      ["queue", "Queue", 2],
      ["started", "Started", 0],
      ["in_progress", "In progress", 0],
      ["in_review", "In review", 1],
      ["done", "Done", 1],
    ]);
    expect(strip.tiles.every((t) => t.href === "/actions?view=board")).toBe(true);
    expect(strip.stuck.href).toBe("/actions?view=board&focus=stuck");
    expect(strip.needsYou.href).toBe("/actions?view=board&focus=needs-you");
  });

  it("counts stuck cards by the column's rule", () => {
    const { seed, load } = setup();
    seed("in_progress", { age: 8 });
    seed("in_progress", { age: 7 });
    seed("in_review", { age: 4 });
    seed("queue", { age: 60 });
    expect(load().stuck.count).toBe(2);
  });

  it("counts the cards that need the owner, without listing them (Today's Needs you does)", () => {
    const { db, seed, load } = setup();
    const job = analystJob(db);
    for (let i = 0; i < 6; i++) {
      insertAction(
        db,
        agentAction(job, `Idea ${i}`, {
          ruleKey: null,
          ...columnTarget("backlog"),
          status: "suggested",
        }),
        "agent",
        null,
        daysAgo(1),
      );
    }
    seed("queue");
    const strip = load();
    expect(strip.needsYou.count).toBe(6);
    expect(strip.needsYou).not.toHaveProperty("lines");
  });

  it("counts moves since midnight in the owner's timezone, not UTC", () => {
    const { seed, db, load } = setup();
    const id = seed("queue", { age: 3 });
    moveToColumn(db, {
      id,
      from: "queue",
      to: "started",
      actor: "owner",
      login: "owner@example.com",
      productIds: ["acme-docs"],
      now: new Date("2026-10-20T22:30:00Z"),
    });
    const afterMidnightUtc = new Date("2026-10-21T00:05:00Z");
    // Just past midnight UTC on 21 Oct; the move was at 22:30 UTC on 20 Oct.
    // London midnight 21 Oct is 23:00 UTC on 20 Oct, so 22:30Z is before it.
    expect(load(afterMidnightUtc, "Europe/London").movedToday.count).toBe(0);
    // In Sydney, 22:30Z is 09:30 on 21 Oct: after local midnight.
    expect(load(afterMidnightUtc, "Australia/Sydney").movedToday.count).toBe(1);
  });

  it("words the latest move and counts each card once", () => {
    const { seed, db, load } = setup();
    const id = seed("queue", { title: "Fix the title" });
    for (const [from, to, hour] of [
      ["queue", "started", 7],
      ["started", "in_progress", 8],
    ] as const) {
      moveToColumn(db, {
        id,
        from,
        to,
        actor: "claude",
        login: "claude",
        note: "Moving on.",
        productIds: ["acme-docs"],
        now: new Date(`2026-10-20T0${hour}:00:00Z`),
      });
    }
    const strip = load();
    expect(strip.movedToday.count).toBe(1);
    expect(strip.movedToday.lastLine).toBe("Claude moved “Fix the title” to In progress.");
    expect(db.select().from(actions).where(eq(actions.id, id)).get()?.stage).toBeNull();
  });

  it("does not count creation or a pull request link as a move", () => {
    const { seed, load } = setup();
    seed("queue", { age: 0 });
    expect(load().movedToday).toEqual({ count: 0, lastLine: null });
  });
});
