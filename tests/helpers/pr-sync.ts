import { eq } from "drizzle-orm";
import { boardColumn } from "@/lib/actions/board-column";
import { linkPullRequest } from "@/lib/actions/pr-link";
import { type GhResult, type GhRunner, isAllowedGhCall } from "@/lib/actions/pr-sync/gh";
import { type SyncDeps, syncPullRequests } from "@/lib/actions/pr-sync/sync";
import { actionEventsFor, insertAction } from "@/lib/actions/store";
import type { ActionStage, ActionStatus } from "@/lib/actions/types";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { ruleAction } from "./actions";
import { openTestDb } from "./db";

export const PRODUCT_IDS = ["acme-docs"];
export const T0 = new Date("2026-10-01T09:00:00Z");
export const NOW = new Date("2026-10-04T09:00:00Z");

/** gh's JSON for a pull request; override any field. */
export function prJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    state: "OPEN",
    isDraft: false,
    mergedAt: null,
    closedAt: null,
    reviewDecision: "",
    statusCheckRollup: [],
    title: "Fix the page titles",
    ...over,
  });
}

export const passing = [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" }];
export const failing = [{ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" }];

/**
 * A fake gh runner: answers per pull request URL (JSON text or a failure) and fails the test on
 * any call outside the read-only allow-list, as the real runner would refuse it.
 */
export function fakeGh(answers: Record<string, string | GhResult>) {
  const calls: string[][] = [];
  const gh: GhRunner = async (args) => {
    if (!isAllowedGhCall(args)) throw new Error(`not allowed: ${args.join(" ")}`);
    calls.push([...args]);
    const answer = answers[args[2] ?? ""];
    if (answer === undefined) return { ok: false, kind: "not_found", detail: "no such PR" };
    return typeof answer === "string" ? { ok: true, stdout: answer } : answer;
  };
  return { gh, calls };
}

const PLACE: Record<string, { status: ActionStatus; stage: ActionStage | null }> = {
  suggested: { status: "suggested", stage: null },
  backlog: { status: "open", stage: null },
  queue: { status: "open", stage: "queue" },
  started: { status: "in_progress", stage: "started" },
  in_review: { status: "in_progress", stage: "in_review" },
  done: { status: "done", stage: null },
  snoozed: { status: "snoozed", stage: null },
};

/** A card in `place` with `pr` linked (or none), titled `title`. */
export function card(db: Db, place: keyof typeof PLACE, pr: string | null, title: string) {
  const { status, stage } = PLACE[place] ?? { status: "open", stage: null };
  const extra = status === "snoozed" ? { snoozedUntil: "2026-12-01" } : {};
  const id = insertAction(
    db,
    ruleAction({ status, stage, title, ruleKey: `rule-${title}`, ...extra }),
    "owner",
    null,
    T0,
  );
  if (pr !== null) linkPullRequest(db, { id, url: pr, productIds: PRODUCT_IDS, now: T0 });
  return id;
}

export function setup() {
  const db = openTestDb();
  const column = (id: number) => {
    const row = db.select().from(actions).where(eq(actions.id, id)).get();
    return row ? boardColumn(row) : undefined;
  };
  const notes = (id: number) => actionEventsFor(db, id).map((e) => e.note);
  const sync = (gh: GhRunner, over: Partial<SyncDeps> = {}) =>
    syncPullRequests({
      db,
      productIds: PRODUCT_IDS,
      gh,
      now: NOW,
      timeZone: "Europe/London",
      locale: "en-GB",
      dryRun: false,
      ...over,
    });
  return { db, column, notes, sync };
}
