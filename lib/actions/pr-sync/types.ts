import type { BoardColumnId } from "../board-column";
import type { GhFailureKind } from "./gh";

/** Why one card could not be synced; each has a plain sentence in lib/explain/pr-sync.ts. */
export type SyncFailureKind =
  | GhFailureKind
  | "unreadable"
  | "bad_link"
  | "out_of_time"
  | "moved_meanwhile"
  | "refused";

/** Why a card was left alone although its pull request disagrees with its column. */
export type SyncHeldReason = "new_idea" | "moved_by_hand";

type Card = { id: number; title: string };

/** What the sync did (or, in a dry run, would do) to one card. */
export type CardOutcome = Card &
  (
    | { result: "moved"; from: BoardColumnId; to: BoardColumnId; notes: string[] }
    | { result: "noted"; notes: string[] }
    | { result: "unchanged" }
    | {
        result: "held";
        reason: SyncHeldReason;
        wanted: BoardColumnId | null;
        notes: string[];
      }
    | { result: "failed"; reason: SyncFailureKind; detail: string }
  );

export type SyncReport = {
  dryRun: boolean;
  outcomes: CardOutcome[];
  /** Cards with a pull request beyond this run's cap, left for the next run. */
  more: number;
};
