import { and, asc, desc, eq, lte, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actionEvents, actions } from "@/lib/db/schema";
import type { ActionActor, ActionStatus, NewAction } from "./types";

/** Events kept per action; older ones are pruned on insert. */
export const MAX_ACTION_EVENTS = 50;

/**
 * Identity of a title for dedupe: NFKC, no invisible format characters (zero-width
 * spaces), lower case, single spaces, no punctuation or spaces at either end.
 */
export function normaliseTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
}

/** Records an event for an action, keeping only the newest MAX_ACTION_EVENTS. */
export function addActionEvent(tx: Db, event: Omit<typeof actionEvents.$inferInsert, "id">): void {
  tx.insert(actionEvents).values(event).run();
  const keep = tx
    .select({ id: actionEvents.id })
    .from(actionEvents)
    .where(eq(actionEvents.actionId, event.actionId))
    .orderBy(desc(actionEvents.id))
    .limit(MAX_ACTION_EVENTS);
  tx.delete(actionEvents)
    .where(and(eq(actionEvents.actionId, event.actionId), notInArray(actionEvents.id, keep)))
    .run();
}

/** Inserts an action with its creation event (`from: null`); returns its id. */
export function insertAction(
  tx: Db,
  action: NewAction,
  actor: ActionActor,
  note: string | null,
  now: Date,
): number {
  // A savepoint when the caller is already in a transaction: the row and its event land together.
  return tx.transaction(
    (t) => {
      const row = t
        .insert(actions)
        .values({
          ...action,
          titleKey: normaliseTitle(action.title),
          createdAt: now,
          updatedAt: now,
          statusChangedAt: now,
        })
        .returning({ id: actions.id })
        .get();
      addActionEvent(t, { actionId: row.id, at: now, actor, from: null, to: action.status, note });
      return row.id;
    },
    { behavior: "immediate" },
  );
}

/** Changes status with an event; returns false when the row is not in `from` any more (race). */
export function setStatus(
  tx: Db,
  id: number,
  from: ActionStatus,
  to: ActionStatus,
  opts: { actor: ActionActor; note?: string | null; snoozedUntil?: string | null; now: Date },
): boolean {
  return tx.transaction(
    (t) => {
      const changed = t
        .update(actions)
        .set({
          status: to,
          snoozedUntil: to === "snoozed" ? (opts.snoozedUntil ?? null) : null,
          updatedAt: opts.now,
          statusChangedAt: opts.now,
        })
        .where(and(eq(actions.id, id), eq(actions.status, from)))
        .returning({ id: actions.id })
        .all();
      if (changed.length === 0) return false;
      const note = opts.note ?? null;
      addActionEvent(t, { actionId: id, at: opts.now, actor: opts.actor, from, to, note });
      return true;
    },
    { behavior: "immediate" },
  );
}

/** An action's history, oldest first. */
export function actionEventsFor(db: Db, id: number): (typeof actionEvents.$inferSelect)[] {
  return db
    .select()
    .from(actionEvents)
    .where(eq(actionEvents.actionId, id))
    .orderBy(asc(actionEvents.id))
    .all();
}

/**
 * An action's kept history. `truncated` when pruning removed its creation event
 * (the only event with no `from`), so older steps are missing.
 */
export function actionHistory(
  db: Db,
  id: number,
): { events: (typeof actionEvents.$inferSelect)[]; truncated: boolean } {
  const events = actionEventsFor(db, id);
  const first = events[0];
  return { events, truncated: first !== undefined && first.from !== null };
}

/** Wakes snoozes whose date has come (snoozedUntil <= today) → open, note "Snooze ended". */
export function wakeDueSnoozes(db: Db, today: string, now: Date): number {
  return db.transaction(
    (tx) => {
      const due = tx
        .select({ id: actions.id })
        .from(actions)
        .where(and(eq(actions.status, "snoozed"), lte(actions.snoozedUntil, today)))
        .all();
      const woken = due.filter((row) =>
        setStatus(tx, row.id, "snoozed", "open", { actor: "system", note: "Snooze ended", now }),
      );
      return woken.length;
    },
    { behavior: "immediate" },
  );
}
