/** "www.example.com" and "example.com" are one site. */
export function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Whether a redirect from `start` to `next` stays on the start's site: the same host, the
 * www/apex swap, or a subdomain of the start host — never a parent (acme.github.io → github.io)
 * or a sibling.
 */
export function sameSite(start: URL, next: URL): boolean {
  const from = siteKey(start.hostname);
  const to = siteKey(next.hostname);
  return to === from || to.endsWith(`.${from}`);
}
