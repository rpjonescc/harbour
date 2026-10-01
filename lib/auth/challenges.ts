import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { authChallenges } from "@/lib/db/schema";
import { purgeExpired } from "./purge";
import { randomToken } from "./token";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type Kind = "register" | "authenticate";

/** Stores a WebAuthn challenge and returns the flow id that links the ceremony's two requests. */
export function saveChallenge(
  db: Db,
  input: { kind: Kind; login: string; challenge: string },
  now: Date = new Date(),
): string {
  // Every options request adds a row; purging here keeps the table bounded.
  purgeExpired(db, now);
  const flowId = randomToken();
  db.insert(authChallenges)
    .values({ flowId, ...input, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) })
    .run();
  return flowId;
}

/** Returns the challenge for a flow exactly once; null if missing, mismatched or expired. */
export function consumeChallenge(
  db: Db,
  input: { flowId: string; kind: Kind; login: string },
  now: Date = new Date(),
): string | null {
  const row = db
    .delete(authChallenges)
    .where(and(eq(authChallenges.flowId, input.flowId), eq(authChallenges.kind, input.kind)))
    .returning()
    .get();
  if (!row || row.login !== input.login || row.expiresAt.getTime() <= now.getTime()) return null;
  return row.challenge;
}
