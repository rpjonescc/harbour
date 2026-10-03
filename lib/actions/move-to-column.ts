import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { type BoardColumnId, boardColumn, columnTarget } from "./board-column";
import type { MoveRefusal } from "./move-refusal";
import { setStatus } from "./store";
import type { ActionActor } from "./types";

export type MoveRequest = {
  id: number;
  /** The column the mover believes the card is in; a different one means the move is stale. */
  from: BoardColumnId;
  to: BoardColumnId;
  /** Claude must give a note, as for a status change. */
  actor: ActionActor;
  note?: string;
  /** The audit log's login: the owner's, or "claude". */
  login: string;
  /** Configured products; a card of any other product is not found. */
  productIds: readonly string[];
  now?: Date;
};

export type MoveResult = { ok: true } | { ok: false; reason: MoveRefusal };

/**
 * The only way to change a card's board column: sets status and stage together. The read, the
 * checks, the compare-and-set write, its event (status and stage, before and after) and the audit
 * entry share one IMMEDIATE transaction. Moving a new idea (suggested) anywhere, Backlog
 * included, accepts it.
 */
export function moveToColumn(db: Db, req: MoveRequest): MoveResult {
  const note = req.note?.trim() || null;
  if (req.actor === "claude" && note === null) return { ok: false, reason: "note_required" };
  const now = req.now ?? new Date();
  return db.transaction(
    (tx): MoveResult => {
      const row = tx.select().from(actions).where(eq(actions.id, req.id)).get();
      if (!row || !req.productIds.includes(row.productId)) {
        return { ok: false, reason: "not_found" };
      }
      // Parked cards (snoozed, dismissed) have no column, so they always read as moved already.
      if (boardColumn(row) !== req.from) return { ok: false, reason: "stale" };
      // A new idea sits in Backlog already; dropping it there accepts it where it is.
      if (req.from === req.to && row.status !== "suggested") {
        return { ok: false, reason: "same_column" };
      }
      // With a pull request and no stage, a card reads as In review: In progress cannot hold it.
      if (req.to === "in_progress" && row.prUrl !== null) {
        return { ok: false, reason: "has_pull_request" };
      }
      const target = columnTarget(req.to);
      if (row.status === "suggested" && target.status === "done") {
        return { ok: false, reason: "not_allowed" };
      }
      const opts = { actor: req.actor, note, stage: target.stage, now };
      // Unreachable today (the read above holds the IMMEDIATE lock), as in applyStatusChange.
      if (!setStatus(tx, req.id, row.status, target.status, opts)) {
        return { ok: false, reason: "stale" };
      }
      const detail = {
        id: req.id,
        actor: req.actor,
        from: row.status,
        to: target.status,
        fromColumn: req.from,
        toColumn: req.to,
      };
      // Never the note: it is free text.
      audit(tx, { login: req.login, event: "action_status_changed", detail }, now);
      return { ok: true };
    },
    { behavior: "immediate" },
  );
}
