/** Shared reading of Google API responses (PageSpeed Insights, Search Console). */
import { z } from "zod";

const googleError = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    errors: z.array(z.object({ reason: z.string() })).optional(),
    // Newer APIs also say why in ErrorInfo details, e.g. SERVICE_DISABLED.
    details: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "userRateLimitExceeded",
]);

export type GoogleError = { message: string; quota: boolean; reasons: string[] };

/** Google's error message, its reasons and whether it is about quota; null if not one. */
export function readGoogleError(body: string): GoogleError | null {
  const parsed = googleError.safeParse(parseJson(body));
  if (!parsed.success) return null;
  const { message, errors = [], details = [] } = parsed.data.error;
  const reasons = [...errors, ...details].flatMap((r) => (r.reason ? [r.reason] : []));
  return { message, quota: reasons.some((r) => QUOTA_REASONS.has(r)), reasons };
}

/** The Cloud project behind the credential has the API switched off (not a sharing problem). */
const DISABLED_REASONS = new Set(["accessNotConfigured", "SERVICE_DISABLED"]);

/** Whether Google's error says the API is not enabled in the credential's Cloud project. */
export function isApiDisabled(google: GoogleError | null): boolean {
  return google?.reasons.some((r) => DISABLED_REASONS.has(r)) ?? false;
}

const MAX_MESSAGE = 300;

/** A message cut to 300 characters, so a verbose error can't flood job events. */
export function shorten(message: string): string {
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message;
}

/** JSON.parse that returns null instead of throwing. */
export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
