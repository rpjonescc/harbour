import { MERGED_NOTE_START, mergedNote, PR_SYNC_NOTE } from "@/lib/explain/pr-sync";
import type { BoardColumnId } from "../board-column";
import type { ChecksState, PrFacts } from "./pr-state";

/** The pull request states the sync records with a move. */
type PrKind = "merged" | "open" | "draft" | "closed";

/** What the sync last recorded on a card for its current pull request link. */
export type SyncHistory = { pr: PrKind | null; checks: "failing" | "passing" | null };

type HistoryEvent = { actor: string; note: string | null };

function noteKind(note: string): Partial<SyncHistory> {
  if (note.startsWith(MERGED_NOTE_START)) return { pr: "merged" };
  if (note === PR_SYNC_NOTE.open) return { pr: "open" };
  if (note === PR_SYNC_NOTE.draft) return { pr: "draft" };
  if (note === PR_SYNC_NOTE.closed) return { pr: "closed" };
  if (note === PR_SYNC_NOTE.checksFailing) return { checks: "failing" };
  if (note === PR_SYNC_NOTE.checksPassing) return { checks: "passing" };
  return {};
}

// pr-link.ts writes these notes; an older link's history says nothing about the current one.
const isLinkNote = (note: string) =>
  note.startsWith("Linked PR ") || note === "Cleared the PR link";

/**
 * The newest sync notes in a card's history (oldest first, as stored), since its pull request
 * was last linked. The notes are the sync's memory: no extra column is needed.
 */
export function readSyncHistory(events: readonly HistoryEvent[]): SyncHistory {
  const found: SyncHistory = { pr: null, checks: null };
  for (const event of [...events].reverse()) {
    if (event.note === null) continue;
    if (isLinkNote(event.note)) break;
    if (event.actor !== "claude") continue;
    const kind = noteKind(event.note);
    found.pr ??= kind.pr ?? null;
    found.checks ??= kind.checks ?? null;
  }
  return found;
}

export type CardPlan = {
  /** The move the pull request asks for, unless the sync already made it once. */
  move: { to: BoardColumnId; note: string } | null;
  /** The column the pull request asks for when the sync already moved the card there once. */
  held: BoardColumnId | null;
  /** A note on the checks, only when they changed since the last one. */
  checksNote: string | null;
};

type Wording = { timeZone: string; locale: string };

function prKind(facts: PrFacts): PrKind {
  if (facts.state === "open") return facts.draft ? "draft" : "open";
  return facts.state;
}

/** Where the pull request says the card belongs, or null when its column is already right. */
function wantedMove(facts: PrFacts, column: BoardColumnId, words: Wording) {
  switch (prKind(facts)) {
    case "merged": {
      const at = facts.state === "merged" ? facts.mergedAt : null;
      const note = mergedNote(at, words.timeZone, words.locale);
      return column === "done" ? null : { to: "done" as const, note };
    }
    case "open":
      return column === "in_review" ? null : { to: "in_review" as const, note: PR_SYNC_NOTE.open };
    case "draft":
      // A draft only says work has started: a card further along stays where it is.
      if (column !== "backlog" && column !== "queue") return null;
      return { to: "started" as const, note: PR_SYNC_NOTE.draft };
    case "closed":
      return column === "backlog" ? null : { to: "backlog" as const, note: PR_SYNC_NOTE.closed };
  }
}

function checksNote(checks: ChecksState, last: SyncHistory["checks"]): string | null {
  if (checks === "failing" && last !== "failing") return PR_SYNC_NOTE.checksFailing;
  if (checks === "passing" && last === "failing") return PR_SYNC_NOTE.checksPassing;
  return null;
}

/**
 * The sync's rules for one accepted card (never a new idea). A move is made once per pull request
 * state: if the sync already recorded this state and the card was moved since, by the owner or
 * the main agent, it is held for a decision rather than moved back every hour.
 */
export function planCard(
  column: BoardColumnId,
  facts: PrFacts,
  history: SyncHistory,
  words: Wording,
): CardPlan {
  const wanted = wantedMove(facts, column, words);
  const checks = facts.state === "open" ? checksNote(facts.checks, history.checks) : null;
  if (wanted !== null && history.pr === prKind(facts)) {
    return { move: null, held: wanted.to, checksNote: checks };
  }
  return { move: wanted, held: null, checksNote: checks };
}
