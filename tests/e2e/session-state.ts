import { SESSION_COOKIE } from "@/lib/auth/cookies";

/** Playwright storage state holding a session cookie exactly as the app sets it. */
export function sessionStorageState(token: string, expires = -1) {
  return {
    cookies: [
      {
        name: SESSION_COOKIE,
        value: token,
        domain: "localhost",
        path: "/",
        expires,
        httpOnly: true,
        secure: true,
        sameSite: "Strict" as const,
      },
    ],
    origins: [],
  };
}
