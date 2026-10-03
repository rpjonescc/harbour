import type { Product } from "@/lib/products/catalog";
import { siteKey } from "./site";

/** Google API hosts the PageSpeed and Search Console collectors call (incl. OAuth tokens). */
export const GOOGLE_API_HOSTS: readonly string[] = [
  "www.googleapis.com",
  "searchconsole.googleapis.com",
  "oauth2.googleapis.com",
];

/**
 * Treg, the pay-per-call data service. Only the `treg` collector calls it: the safe fetch takes a
 * POST with custom headers for this host alone, and never follows a redirect from it.
 */
export const TREG_HOST = "treg.to";

/**
 * Every host a scan may contact: each product's apex and www host, the Google API hosts and Treg.
 */
export function outboundHosts(products: readonly Product[]): ReadonlySet<string> {
  const hosts = new Set([...GOOGLE_API_HOSTS, TREG_HOST]);
  for (const product of products) {
    const apex = siteKey(new URL(product.url).hostname);
    hosts.add(apex);
    hosts.add(`www.${apex}`);
  }
  return hosts;
}
