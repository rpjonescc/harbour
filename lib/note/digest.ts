import { createHash } from "node:crypto";

/**
 * The sha256 (hex) of a note file's exact bytes. The worker stores it on the succeeded job when
 * the checked note is committed; the web process shows a file only while its bytes still hash to
 * it, so a note edited after it was checked is never shown.
 */
export function noteDigest(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
