// Seeds the Actions board for board.spec.ts through production code: six cards of the fictional
// Fern & Field, one per situation the spec exercises (a plain backlog card to move by keyboard,
// another to drag, a card with a pull request, a stuck card, a queued and a finished one). Run
// from the spec, so earlier projects still see the board they expect.
import { eq } from "drizzle-orm";
import { linkPullRequest } from "@/lib/actions/pr-link";
import { insertAction } from "@/lib/actions/store";
import type { ActionStage, ActionStatus, NewAction } from "@/lib/actions/types";
import { migrateDb, openDb } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { E2E_DB } from "../../playwright.config";

export const FERN = { id: "fern-and-field", name: "Fern & Field" };

/** The cards the spec finds by title. */
export const BOARD_CARDS = {
  keyboard: "Add opening hours to the footer",
  drag: "Write a guide to repotting ferns",
  withPullRequest: "Fix the broken checkout link",
  stuck: "Update the delivery times page",
  queued: "Order new plant labels",
  finished: "Photograph the new shop sign",
} as const;

const PULL_REQUEST = "https://github.com/example/fern-and-field/pull/7";
const DAY = 24 * 60 * 60 * 1000;

function card(title: string, status: ActionStatus, stage: ActionStage | null): NewAction {
  return {
    productId: FERN.id,
    area: "SEO",
    title,
    why: "Visitors look for this first.",
    fix: "Make the change on the live site.",
    check: "The page shows the change.",
    impact: "medium",
    effort: "small",
    evidence: { items: [], total: 0 },
    docs: [],
    source: "manual",
    ruleKey: null,
    sourceJobId: null,
    status,
    stage,
    snoozedUntil: null,
    issuePresent: null,
  };
}

/** Seeds once: a rerun (another worker, a retry) finds Fern & Field's cards and does nothing. */
export function seedBoard(): void {
  const db = openDb(E2E_DB);
  migrateDb(db);
  if (db.select().from(actions).where(eq(actions.productId, FERN.id)).get()) return;
  const now = new Date();
  const add = (n: NewAction, at = now) => insertAction(db, n, "owner", null, at);
  add(card(BOARD_CARDS.keyboard, "open", null));
  add(card(BOARD_CARDS.drag, "open", null));
  add(card(BOARD_CARDS.queued, "open", "queue"));
  // Ten days in Started is past the stuck limit.
  add(card(BOARD_CARDS.stuck, "open", "started"), new Date(now.getTime() - 10 * DAY));
  add(card(BOARD_CARDS.finished, "done", null));
  const withPr = add(card(BOARD_CARDS.withPullRequest, "in_progress", null));
  linkPullRequest(db, { id: withPr, url: PULL_REQUEST, productIds: [FERN.id], now });
}
