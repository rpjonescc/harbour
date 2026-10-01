export const SESSION_COOKIE = "harbour_session";
export const FLOW_COOKIE = "harbour_flow";

// The database is authoritative for expiry; the cookie just lives as long as browsers allow.
const BROWSER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Session cookie attributes (spec §10). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: BROWSER_MAX_AGE_SECONDS,
  };
}

/** Short-lived cookie that links a WebAuthn ceremony's two requests. */
export function flowCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/api/auth",
    maxAge: 300,
  };
}
