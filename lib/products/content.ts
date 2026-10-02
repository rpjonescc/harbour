import type { Platform } from "@/lib/content/ids";
import type { ProductConfig } from "./config";

export type ProductEntry = ProductConfig["products"][number];
/** A product the content machine is switched on for: it has an entry under `content.products`. */
export type ContentProduct = ProductEntry & { terms: string[]; platforms: Platform[] };

/** The products with content enabled, in display order. */
export function contentProducts(config: ProductConfig): ContentProduct[] {
  const entries = config.content?.products ?? {};
  return config.products.flatMap((product) => {
    const entry = entries[product.id];
    return entry ? [{ ...product, terms: entry.terms, platforms: entry.platforms }] : [];
  });
}
