import { getConfig } from "@/lib/config";
import { resolveIdentity } from "./tailscale";

/** Tailscale login for a route handler request (defence in depth behind the proxy). */
export function requestLogin(request: Request): string | null {
  const identity = resolveIdentity(request.headers, getConfig());
  return identity.ok ? identity.login : null;
}
