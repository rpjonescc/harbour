/**
 * "www.example.com" and "example.com" are one site. A leading www is dropped only when a dot is
 * left ("www.com" stays: dropping it would leave the bare suffix "com").
 */
export function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\.(?=.*\.)/, "");
}

/**
 * A hostname normalised the way a product's own domain is: lower case, trailing dots off
 * ("example.com." is "example.com"), then a leading www off (see siteKey). Both sides of a host
 * comparison use this, so they always agree.
 */
export function domainKey(hostname: string): string {
  return siteKey(hostname.replace(/\.+$/, ""));
}

/**
 * A product's own domain, normalised in one place for everything that stores or reads its checks
 * (see domainKey). The port and path of the URL are not part of it.
 */
export function productDomain(url: string): string {
  return domainKey(new URL(url).hostname);
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
