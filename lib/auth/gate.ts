import type { Config } from "@/lib/config";
import { isPublicPath } from "./paths";
import { resolveIdentity } from "./tailscale";

export type GateDecision =
  | { kind: "forbid" }
  | { kind: "login" }
  | { kind: "unauthenticated" }
  | { kind: "next"; login: string };

/**
 * Edge decision for every request. Lock 1 is enforced here for all paths; Lock 2
 * (session validity) is checked in server code because it needs the database.
 */
export function decideGate(
  input: { headers: Headers; pathname: string; hasSessionCookie: boolean },
  config: Config,
): GateDecision {
  const identity = resolveIdentity(input.headers, config);
  if (!identity.ok) return { kind: "forbid" };
  if (!input.hasSessionCookie && !isPublicPath(input.pathname)) {
    // API callers get a 401 they can act on; a redirect to an HTML page would look like success.
    return input.pathname.startsWith("/api/") ? { kind: "unauthenticated" } : { kind: "login" };
  }
  return { kind: "next", login: identity.login };
}
