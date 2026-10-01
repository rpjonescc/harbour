import type { Config } from "@/lib/config";

/** Header Tailscale Serve adds with the visitor's verified login (it strips client-sent copies). */
export const TS_LOGIN_HEADER = "tailscale-user-login";

export type IdentityResult =
  | { ok: true; login: string }
  | { ok: false; reason: "missing" | "not-allowed" };

/** Lock 1: who is this, according to Tailscale, and are they allowed in? */
export function resolveIdentity(headers: Headers, config: Config): IdentityResult {
  const header = headers.get(TS_LOGIN_HEADER)?.trim().toLowerCase();
  const devIdentity =
    config.NODE_ENV !== "production"
      ? config.HARBOUR_DEV_IDENTITY?.trim().toLowerCase()
      : undefined;
  const login = header || devIdentity;
  if (!login) return { ok: false, reason: "missing" };
  if (!config.HARBOUR_ALLOWED_LOGINS.includes(login)) return { ok: false, reason: "not-allowed" };
  return { ok: true, login };
}
