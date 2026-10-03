import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { addActionEvent } from "./store";

export type NoteRequest = { id: number; note: string; productIds: readonly string[]; now: Date };
export type NoteResult = { ok: true } | { ok: false; error: "not_found" };

/**
 * Records a note on a card for Claude, leaving it where it is: the history entry runs from the
 * card's status and stage to themselves, so it is never read as a move. The entry and its audit
 * entry share one IMMEDIATE transaction. The note's length is checked by the caller.
 */
export function addNote(db: Db, req: NoteRequest): NoteResult {
  return db.transaction(
    (tx): NoteResult => {
      const row = tx.select().from(actions).where(eq(actions.id, req.id)).get();
      if (!row || !req.productIds.includes(row.productId)) return { ok: false, error: "not_found" };
      addActionEvent(tx, {
        actionId: req.id,
        at: req.now,
        actor: "claude",
        from: row.status,
        to: row.status,
        fromStage: row.stage,
        toStage: row.stage,
        note: req.note,
      });
      audit(tx, { login: "claude", event: "action_noted", detail: { id: req.id } }, req.now);
      return { ok: true };
    },
    { behavior: "immediate" },
  );
}
