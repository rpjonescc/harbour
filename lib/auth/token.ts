import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way hash used to store tokens at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
