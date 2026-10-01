import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { passkeys, sessions } from "@/lib/db/schema";

export type DeviceSummary = {
  id: string;
  deviceLabel: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  current: boolean;
};

/** Passkeys registered for a login, oldest first. */
export function listDevices(
  db: Db,
  login: string,
  currentPasskeyId: string | null = null,
): DeviceSummary[] {
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
    .all()
    .map((device) => ({ ...device, current: device.id === currentPasskeyId }));
}

/** Return an unused device name, adding a numeric suffix when needed. */
export function uniqueDeviceLabel(existing: string[], label: string): string {
  const base = label.trim();
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  // At most `existing.length` suffixes can be occupied, so a free name is guaranteed.
  for (let n = 2; n <= existing.length + 2; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("Could not allocate a unique device name");
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
