/** Shared reading of Google API responses (PageSpeed Insights, Search Console). */
import { z } from "zod";

const googleError = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    errors: z.array(z.object({ reason: z.string() })).optional(),
  }),
});

const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "userRateLimitExceeded",
]);

/** Google's error message and whether it is about quota, or null if the body isn't one. */
export function readGoogleError(body: string): { message: string; quota: boolean } | null {
  const parsed = googleError.safeParse(parseJson(body));
  if (!parsed.success) return null;
  const reasons = parsed.data.error.errors ?? [];
  return {
    message: parsed.data.error.message,
    quota: reasons.some((r) => QUOTA_REASONS.has(r.reason)),
  };
}

/** JSON.parse that returns null instead of throwing. */
export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
