import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { passkeys, sessions } from "@/lib/db/schema";

export type DeviceSummary = {
  id: string;
  deviceLabel: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

/** Passkeys registered for a login, oldest first. */
export function listDevices(db: Db, login: string): DeviceSummary[] {
  return db
    .select({
      id: passkeys.id,
      deviceLabel: passkeys.deviceLabel,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.login, login))
    .orderBy(asc(passkeys.createdAt))
    .all();
}

/**
 * Deletes one of the login's passkeys and every session it signed in, atomically.
 * False if it doesn't exist or isn't theirs.
 */
export function removeDevice(db: Db, login: string, id: string): boolean {
  return db.transaction((tx) => {
    const removed = tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.login, login)))
      .returning()
      .all();
    if (removed.length !== 1) return false;
    tx.delete(sessions)
      .where(and(eq(sessions.passkeyId, id), eq(sessions.login, login)))
      .run();
    return true;
  });
}
