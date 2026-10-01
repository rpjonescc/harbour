// Reachable with a Tailscale identity but before a passkey session exists.
const PUBLIC_EXACT = ["/login", "/setup"];
const PUBLIC_PREFIXES = ["/api/auth/"];

/** True for pages and endpoints used to obtain a session. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
