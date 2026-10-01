import { isNotNull, lte, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { authChallenges, sessions, setupTokens } from "@/lib/db/schema";

/** Deletes expired sessions and challenges and spent setup tokens so auth tables stay bounded. */
export function purgeExpired(db: Db, now: Date = new Date()): void {
  db.delete(sessions).where(lte(sessions.expiresAt, now)).run();
  db.delete(authChallenges).where(lte(authChallenges.expiresAt, now)).run();
  db.delete(setupTokens)
    .where(or(isNotNull(setupTokens.usedAt), lte(setupTokens.expiresAt, now)))
    .run();
}
