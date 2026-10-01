import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { setupTokens } from "@/lib/db/schema";
import { hashToken, randomToken } from "./token";

export const SETUP_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Issues a single-use token that authorises registering one passkey. */
export function issueSetupToken(db: Db, now: Date = new Date()) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_MS);
  db.insert(setupTokens)
    .values({ tokenHash: hashToken(token), createdAt: now, expiresAt })
    .run();
  return { token, expiresAt };
}

/** Marks a setup token used. True only for an unused, unexpired token. */
export function consumeSetupToken(db: Db, token: string, now: Date = new Date()): boolean {
  const updated = db
    .update(setupTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(setupTokens.tokenHash, hashToken(token)),
        isNull(setupTokens.usedAt),
        gt(setupTokens.expiresAt, now),
      ),
    )
    .returning()
    .all();
  return updated.length === 1;
}
