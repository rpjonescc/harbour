import { stripInvisible } from "@/lib/text/hidden-chars";
import { siteKey } from "../site";

// Whether a site is the one a result is about. Pure: the provider's strings are untrusted, so a
// host is accepted only in a strict, cleaned form and compared by whole labels.

const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,98}[a-z0-9])?$/;
/** The longest name we look for in an answer: a longer one is not a product name. */
const MAX_NAME = 200;

/** The product's own domain: its URL's host without a leading www. */
export function productDomain(url: string): string {
  return siteKey(new URL(url).hostname);
}

/** A lowercase host without www in a strict form, or null for anything else. */
export function cleanHost(raw: string): string | null {
  const host = siteKey(stripInvisible(raw).trim()).replace(/\.$/, "");
  return HOST.test(host) ? host : null;
}

/** The cleaned host of an http(s) URL, or null. */
export function hostOfUrl(raw: string): string | null {
  const url = URL.parse(raw);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  return cleanHost(url.hostname);
}

/** An http(s) URL in its normalised, ASCII form (so no hidden characters), or null; at most 2,000 characters. */
export function normalisedUrl(raw: string): string | null {
  const url = URL.parse(raw);
  if (!url || !/^https?:$/.test(url.protocol) || url.href.length > 2_000) return null;
  return url.href;
}

/** Whether `host` is `domain` or one of its subdomains (never a lookalike like "notexample.com"). */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const WORD_BEFORE = "(?<![\\p{L}\\p{N}])";
const WORD_AFTER = "(?![\\p{L}\\p{N}])";
// A host is not "named" inside a longer one: no letter, digit or hyphen before it (not-acme.com is
// out, sub.acme.com is in) and no further label or hyphen after it (acme.com.au is out).
const HOST_BEFORE = "(?<![\\p{L}\\p{N}-])";
const HOST_AFTER = "(?![\\p{L}\\p{N}-]|\\.[\\p{L}\\p{N}])";

/** `term` in `text` between the given boundaries (any script); false for an empty or huge term. */
function hasTerm(text: string, term: string, before: string, after: string): boolean {
  if (term === "" || term.length > MAX_NAME) return false;
  return new RegExp(`${before}${escapeRegex(term)}${after}`, "u").test(text);
}

/** Whether the answer names the product: its name as a whole word, or its domain as a host. */
export function mentionsProduct(
  answer: string,
  product: { name: string; domain: string },
): boolean {
  const text = stripInvisible(answer).toLowerCase();
  const name = product.name.trim().toLowerCase();
  return (
    hasTerm(text, product.domain, HOST_BEFORE, HOST_AFTER) ||
    hasTerm(text, name, WORD_BEFORE, WORD_AFTER)
  );
}
