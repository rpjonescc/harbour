import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { loadBoard } from "./board-view";
import { moveToColumn } from "./move-to-column";
import { linkPullRequest } from "./pr-link";
import { actionEventsFor, insertAction } from "./store";

const PRODUCTS = [{ id: "acme-docs", name: "Acme Docs" }];
const PRODUCT_IDS = ["acme-docs"];
const NOW = new Date("2026-10-20T09:00:00Z");
const FIVE_DAYS_AGO = new Date(NOW.getTime() - 5 * 24 * 3_600_000);
const PR = "https://github.com/acme/widget/pull/12";

/** The review's scenario: a card In progress (no stage) for five days, then Claude links its PR. */
function linkedAfterFiveDays() {
  const db = openTestDb();
  const id = insertAction(
    db,
    ruleAction({ status: "in_progress" }),
    "claude",
    "on it",
    FIVE_DAYS_AGO,
  );
  expect(linkPullRequest(db, { id, url: PR, productIds: PRODUCT_IDS, now: NOW })).toMatchObject({
    ok: true,
  });
  const card = () =>
    loadBoard(db, { productId: null, area: null }, NOW, PRODUCTS).columns.in_review.find(
      (c) => c.id === id,
    );
  const row = () => db.select().from(actions).where(eq(actions.id, id)).get();
  const move = (from: "in_progress" | "in_review", to: "in_review" | "done" | "in_progress") =>
    moveToColumn(db, {
      id,
      from,
      to,
      actor: "claude",
      note: "follow-up",
      login: "claude",
      productIds: PRODUCT_IDS,
      now: NOW,
    });
  return { db, id, card, row, move };
}

describe("linking a pull request to a card In progress", () => {
  it("moves it to In review as a fresh change, so it is not Stuck", () => {
    const { card, row } = linkedAfterFiveDays();
    expect(row()).toMatchObject({ stage: "in_review", statusChangedAt: NOW });
    expect(card()).toMatchObject({ column: "in_review", stuck: false });
    expect(card()?.lastMove).toMatchObject({ actor: "claude", to: "in_review", at: NOW });
  });

  it("records the move in history with its stage, so it counts as a column change", () => {
    const { db, id } = linkedAfterFiveDays();
    expect(actionEventsFor(db, id).at(-1)).toMatchObject({
      from: "in_progress",
      to: "in_progress",
      fromStage: null,
      toStage: "in_review",
      note: `Linked PR ${PR}`,
    });
  });

  it("lets a follow-up move to Done through and refuses only what is already true", () => {
    const { move, row } = linkedAfterFiveDays();
    expect(move("in_progress", "in_review")).toEqual({ ok: false, reason: "stale" });
    expect(move("in_review", "in_review")).toEqual({ ok: false, reason: "same_column" });
    expect(move("in_review", "in_progress")).toEqual({ ok: false, reason: "has_pull_request" });
    expect(move("in_review", "done")).toEqual({ ok: true });
    expect(row()).toMatchObject({ status: "done", stage: null });
  });
});

describe("linking a pull request to a card the link does not move", () => {
  it("keeps its stage and last-change time, and is no move in history", () => {
    const db = openTestDb();
    const at = FIVE_DAYS_AGO;
    const id = insertAction(
      db,
      ruleAction({ status: "in_progress", stage: "started" }),
      "scan",
      null,
      at,
    );
    linkPullRequest(db, { id, url: PR, productIds: PRODUCT_IDS, now: NOW });
    const row = db.select().from(actions).where(eq(actions.id, id)).get();
    expect(row).toMatchObject({ prUrl: PR, stage: "started", statusChangedAt: at });
    expect(actionEventsFor(db, id).at(-1)).toMatchObject({
      fromStage: "started",
      toStage: "started",
    });
  });
});

describe("clearing the link of an older card that read In review only by its link", () => {
  it("puts it back In progress with a fresh last-change time", () => {
    const NINE_DAYS_AGO = new Date(NOW.getTime() - 9 * 24 * 3_600_000);
    const db = openTestDb();
    const id = insertAction(db, ruleAction({ status: "in_progress" }), "scan", null, NINE_DAYS_AGO);
    db.update(actions).set({ prUrl: PR }).where(eq(actions.id, id)).run();
    linkPullRequest(db, { id, url: null, productIds: PRODUCT_IDS, now: NOW });
    const board = loadBoard(db, { productId: null, area: null }, NOW, PRODUCTS);
    expect(board.columns.in_progress.map((c) => [c.id, c.stuck])).toEqual([[id, false]]);
  });
});
