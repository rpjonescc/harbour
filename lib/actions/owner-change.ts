import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { setStatus } from "./store";
import { checkTransition, type OwnerChange } from "./transitions";
import type { ActionStatus } from "./types";

export type OwnerChangeRequest = {
  id: number;
  /** The status the owner's page showed; a different stored status means the click is stale. */
  from: ActionStatus;
  change: OwnerChange;
  login: string;
  productIds: readonly string[];
  /** YYYY-MM-DD in HARBOUR_TIMEZONE, for snooze dates. */
  today: string;
  now: Date;
};

export type OwnerChangeResult =
  | { ok: true; id: number; status: ActionStatus; snoozedUntil: string | null }
  | { ok: false; error: "not_found" }
  | { ok: false; error: string; conflict: true };

/**
 * Applies the owner's status change: the read, the checks, the status write and its audit
 * entry share one IMMEDIATE transaction, so they land together or not at all.
 */
export function applyOwnerChange(db: Db, req: OwnerChangeRequest): OwnerChangeResult {
  return db.transaction(
    (tx): OwnerChangeResult => {
      const row = tx.select().from(actions).where(eq(actions.id, req.id)).get();
      if (!row || !req.productIds.includes(row.productId)) return { ok: false, error: "not_found" };
      if (row.status !== req.from) return { ok: false, error: "stale", conflict: true };
      const reason = checkTransition(req.from, req.change, req.today);
      if (reason) return { ok: false, error: reason, conflict: true };
      const { to, until } = req.change;
      const snoozedUntil = until ?? null;
      const note = req.change.note || null;
      if (
        !setStatus(tx, req.id, req.from, to, { actor: "owner", note, snoozedUntil, now: req.now })
      )
        return { ok: false, error: "conflict", conflict: true };
      audit(
        tx,
        {
          login: req.login,
          event: "action_status_changed",
          // Never the note: it is the owner's free text.
          detail: { id: req.id, from: req.from, to, until: snoozedUntil },
        },
        req.now,
      );
      return { ok: true, id: req.id, status: to, snoozedUntil };
    },
    { behavior: "immediate" },
  );
}
