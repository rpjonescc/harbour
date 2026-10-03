import { and, asc, count, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { type BoardColumnId, boardColumn } from "../board-column";
import { MOVE_REFUSAL } from "../move-refusal";
import { moveToColumn } from "../move-to-column";
import { addNote } from "../note";
import { parsePullRequestUrl } from "../pr-url";
import { actionEventsFor } from "../store";
import type { ActionRow, ActionStatus } from "../types";
import { type GhRunner, prViewArgs } from "./gh";
import { type CardPlan, planCard, readSyncHistory } from "./plan";
import { type PrFacts, parsePrFacts } from "./pr-state";
import type { CardOutcome, SyncFailureKind, SyncReport } from "./types";

/** Most cards one run checks; the rest wait for the next run. */
export const MAX_SYNC_CARDS = 50;

/** Longest one run spends checking; cards not reached by then are reported as not checked. */
export const SYNC_TIME_LIMIT_MS = 5 * 60_000;

// Done, snoozed and dismissed cards are settled or parked: the sync never touches them.
const SYNCED: readonly ActionStatus[] = ["suggested", "open", "in_progress"];

// Failures that would repeat for every card: the run stops calling gh after the first one.
const BLOCKING: ReadonlySet<SyncFailureKind> = new Set([
  "gh_missing",
  "not_logged_in",
  "rate_limited",
]);

export type SyncDeps = {
  db: Db;
  productIds: readonly string[];
  gh: GhRunner;
  now: Date;
  /** HARBOUR_TIMEZONE and HARBOUR_LOCALE, for the merged date in a note. */
  timeZone: string;
  locale: string;
  dryRun: boolean;
  maxCards?: number;
  timeLimitMs?: number;
  /** Milliseconds, for the time limit; Date.now by default. */
  clock?: () => number;
};

type Failed = Extract<CardOutcome, { result: "failed" }>;

function failed(row: ActionRow, reason: SyncFailureKind, detail = ""): Failed {
  return { id: row.id, title: row.title, result: "failed", reason, detail };
}

/** Cards with a pull request link that are not done or parked, least recently changed first. */
function cardsToSync(db: Db, productIds: readonly string[], cap: number) {
  if (productIds.length === 0) return { rows: [], total: 0 };
  const where = and(
    inArray(actions.productId, [...productIds]),
    inArray(actions.status, [...SYNCED]),
    isNotNull(actions.prUrl),
  );
  const rows = db
    .select()
    .from(actions)
    .where(where)
    .orderBy(asc(actions.updatedAt), asc(actions.id))
    .limit(cap)
    .all();
  const total = db.select({ n: count() }).from(actions).where(where).get()?.n ?? rows.length;
  return { rows, total };
}

async function readPr(row: ActionRow, gh: GhRunner): Promise<PrFacts | Failed> {
  const link = parsePullRequestUrl(row.prUrl ?? "");
  if (!link.ok) return failed(row, "bad_link");
  const answer = await gh(prViewArgs(link.url));
  if (!answer.ok) return failed(row, answer.kind, answer.detail);
  return parsePrFacts(answer.stdout) ?? failed(row, "unreadable");
}

/** Writes the plan through the board's own move and note paths; a failure if it was refused. */
function write(deps: SyncDeps, row: ActionRow, column: BoardColumnId, plan: CardPlan) {
  const base = { id: row.id, productIds: deps.productIds, now: deps.now };
  if (plan.move !== null) {
    const { to, note } = plan.move;
    const move = { ...base, from: column, to, actor: "claude" as const, note, login: "claude" };
    const moved = moveToColumn(deps.db, move);
    if (!moved.ok && moved.reason === "stale") return failed(row, "moved_meanwhile");
    if (!moved.ok) return failed(row, "refused", MOVE_REFUSAL[moved.reason]);
  }
  if (plan.checksNote !== null && !addNote(deps.db, { ...base, note: plan.checksNote }).ok) {
    return failed(row, "moved_meanwhile");
  }
  return null;
}

/** What the plan did (or, in a dry run, would do) to the card. */
function outcome(row: ActionRow, column: BoardColumnId, plan: CardPlan): CardOutcome {
  const card = { id: row.id, title: row.title };
  const notes = plan.checksNote === null ? [] : [plan.checksNote];
  if (plan.move !== null) {
    const { to, note } = plan.move;
    return { ...card, result: "moved", from: column, to, notes: [note, ...notes] };
  }
  if (plan.held !== null) {
    return { ...card, result: "held", reason: "moved_by_hand", wanted: plan.held, notes };
  }
  return notes.length > 0 ? { ...card, result: "noted", notes } : { ...card, result: "unchanged" };
}

async function syncCard(deps: SyncDeps, row: ActionRow): Promise<CardOutcome> {
  // The column read with the card: the move is a compare-and-set against it.
  const column = boardColumn(row);
  if (column === null) return { id: row.id, title: row.title, result: "unchanged" };
  if (row.status === "suggested") {
    // Moving a new idea anywhere accepts it, and accepting is the owner's call.
    return {
      id: row.id,
      title: row.title,
      result: "held",
      reason: "new_idea",
      wanted: null,
      notes: [],
    };
  }
  const facts = await readPr(row, deps.gh);
  if ("result" in facts) return facts;
  const history = readSyncHistory(actionEventsFor(deps.db, row.id));
  const words = { timeZone: deps.timeZone, locale: deps.locale };
  const plan = planCard(column, facts, history, words);
  return (deps.dryRun ? null : write(deps, row, column, plan)) ?? outcome(row, column, plan);
}

/**
 * Brings each linked card's column in line with its pull request (rules in plan.ts), one gh
 * call at a time, at most `maxCards` cards and `timeLimitMs` per run. Nothing a card cannot be
 * checked for is hidden: it is a failed outcome.
 */
export async function syncPullRequests(deps: SyncDeps): Promise<SyncReport> {
  const cap = deps.maxCards ?? MAX_SYNC_CARDS;
  const limit = deps.timeLimitMs ?? SYNC_TIME_LIMIT_MS;
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const { rows, total } = cardsToSync(deps.db, deps.productIds, cap);
  const outcomes: CardOutcome[] = [];
  let blocked: Failed | null = null;
  for (const row of rows) {
    if (blocked !== null) {
      outcomes.push(failed(row, blocked.reason, blocked.detail));
    } else if (clock() - started >= limit) {
      outcomes.push(failed(row, "out_of_time"));
    } else {
      const outcome = await syncCard(deps, row);
      if (outcome.result === "failed" && BLOCKING.has(outcome.reason)) blocked = outcome;
      outcomes.push(outcome);
    }
  }
  return { dryRun: deps.dryRun, outcomes, more: total - rows.length };
}
