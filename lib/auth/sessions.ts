import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { hashToken, randomToken } from "./token";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Avoid a write on every request: extend expiry at most once a day.
const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Starts a session for a login and returns the raw token for the cookie.
 * `passkeyId` is the credential that signed in (null only for sessions minted outside a ceremony).
 */
export function createSession(
  db: Db,
  login: string,
  passkeyId: string | null,
  now: Date = new Date(),
) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({
      tokenHash: hashToken(token),
      login,
      passkeyId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    })
    .run();
  return { token, expiresAt };
}

/** Lock 2: returns the session if the token is valid for this Tailscale login. */
export function validateSession(db: Db, token: string, login: string, now: Date = new Date()) {
  const tokenHash = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
  if (!row || row.login !== login || row.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - row.lastSeenAt.getTime() < SLIDE_AFTER_MS) {
    return { login: row.login, expiresAt: row.expiresAt, passkeyId: row.passkeyId };
  }
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.update(sessions)
    .set({ lastSeenAt: now, expiresAt })
    .where(eq(sessions.tokenHash, tokenHash))
    .run();
  return { login: row.login, expiresAt, passkeyId: row.passkeyId };
}

/** Ends a session (logout). */
export function revokeSession(db: Db, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .run();
}
