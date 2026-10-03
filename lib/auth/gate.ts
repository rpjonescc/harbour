import type { Config } from "@/lib/config";
import { isPublicPath } from "./paths";
import { resolveIdentity } from "./tailscale";

export type GateDecision =
  | { kind: "forbid" }
  | { kind: "login" }
  | { kind: "unauthenticated" }
  | { kind: "next"; login: string };

/**
 * The request must name HARBOUR_ORIGIN's host (and port): a request for any other name, such as
 * a DNS-rebound domain or a loopback address, is refused. Tailscale Serve passes the browser's
 * Host through unchanged.
 */
function forOurHost(headers: Headers, origin: string): boolean {
  return headers.get("host")?.toLowerCase() === new URL(origin).host;
}

/**
 * Edge decision for every request. Lock 1 is enforced here for all paths; Lock 2
 * (session validity) is checked in server code because it needs the database.
 */
export function decideGate(
  input: { headers: Headers; pathname: string; hasSessionCookie: boolean },
  config: Config,
): GateDecision {
  if (!forOurHost(input.headers, config.HARBOUR_ORIGIN)) return { kind: "forbid" };
  const identity = resolveIdentity(input.headers, config);
  if (!identity.ok) return { kind: "forbid" };
  if (!input.hasSessionCookie && !isPublicPath(input.pathname)) {
    // API callers get a 401 they can act on; a redirect to an HTML page would look like success.
    return input.pathname.startsWith("/api/") ? { kind: "unauthenticated" } : { kind: "login" };
  }
  return { kind: "next", login: identity.login };
}
