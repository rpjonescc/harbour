import type { Product } from "@/lib/products/catalog";
import { siteKey } from "./site";

/** Google API hosts the PageSpeed and Search Console collectors call (incl. OAuth tokens). */
export const GOOGLE_API_HOSTS: readonly string[] = [
  "www.googleapis.com",
  "searchconsole.googleapis.com",
  "oauth2.googleapis.com",
];

/** Every host a scan may contact: each product's apex and www host, plus the Google API hosts. */
export function outboundHosts(products: readonly Product[]): ReadonlySet<string> {
  const hosts = new Set(GOOGLE_API_HOSTS);
  for (const product of products) {
    const apex = siteKey(new URL(product.url).hostname);
    hosts.add(apex);
    hosts.add(`www.${apex}`);
  }
  return hosts;
}
