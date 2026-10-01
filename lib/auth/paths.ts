// Reachable with a Tailscale identity but before a passkey session exists.
// App-install assets are reachable before a passkey session because browsers fetch them without cookies.
const PUBLIC_EXACT = ["/login", "/setup", "/manifest.webmanifest", "/icon", "/apple-icon"];
const PUBLIC_PREFIXES = ["/api/auth/", "/icons/"];

/** True for auth entry points and app-install assets. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
