import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { setStatus } from "./store";
import { checkTransition, type StatusChange } from "./transitions";
import type { ActionStatus } from "./types";

/** Who may move an action by hand: the owner on the board, or Claude through `pnpm actions`. */
export type StatusChanger = "owner" | "claude";

export type StatusChangeRequest = {
  id: number;
  /** The status the caller last saw; a different stored status means the change is stale. */
  from: ActionStatus;
  change: StatusChange;
  actor: StatusChanger;
  /** The audit log's login: the owner's, or "claude". */
  login: string;
  productIds: readonly string[];
  /** YYYY-MM-DD in HARBOUR_TIMEZONE, for snooze dates. */
  today: string;
  now: Date;
};

export type StatusChangeResult =
  | { ok: true; id: number; status: ActionStatus; snoozedUntil: string | null }
  | { ok: false; error: "not_found" }
  | { ok: false; error: string; conflict: true };

/**
 * Applies a hand-made status change (owner or Claude) under the same rules: the read, the
 * checks, the status write and its audit entry share one IMMEDIATE transaction, so they land
 * together or not at all.
 */
export function applyStatusChange(db: Db, req: StatusChangeRequest): StatusChangeResult {
  return db.transaction(
    (tx): StatusChangeResult => {
      const row = tx.select().from(actions).where(eq(actions.id, req.id)).get();
      if (!row || !req.productIds.includes(row.productId)) return { ok: false, error: "not_found" };
      if (row.status !== req.from) return { ok: false, error: "stale", conflict: true };
      const reason = checkTransition(req.from, req.change, req.today);
      if (reason) return { ok: false, error: reason, conflict: true };
      const { to, until } = req.change;
      const snoozedUntil = until ?? null;
      const note = req.change.note || null;
      const opts = { actor: req.actor, note, snoozedUntil, now: req.now };
      // Unreachable today (the read above holds the IMMEDIATE lock); kept so a future change that
      // moves the read out of this transaction still refuses instead of writing a stale audit.
      if (!setStatus(tx, req.id, req.from, to, opts)) {
        return { ok: false, error: "conflict", conflict: true };
      }
      audit(
        tx,
        {
          login: req.login,
          event: "action_status_changed",
          // Never the note: it is free text.
          detail: { id: req.id, actor: req.actor, from: req.from, to, until: snoozedUntil },
        },
        req.now,
      );
      return { ok: true, id: req.id, status: to, snoozedUntil };
    },
    { behavior: "immediate" },
  );
}
