import { getConfig } from "@/lib/config";
import { type Hue, type LoadedProductConfig, loadProductConfig } from "./config";

export type { Hue } from "./config";

export type ProductId = string;

export type Product = { id: ProductId; name: string; url: string; hue: Hue };

const EXAMPLE_CONFIG_PATH = "./harbour.config.example.json";

let cached: LoadedProductConfig | undefined;

/** Process-wide product config (products plus whether it is the demo example), loaded once. */
export function getProductConfig(): LoadedProductConfig {
  cached ??= loadProductConfig(getConfig().HARBOUR_CONFIG_PATH, EXAMPLE_CONFIG_PATH);
  return cached;
}

/** Products Harbour watches, in display order. */
export function getProducts(): readonly Product[] {
  return getProductConfig().products;
}

/** Looks up a configured product; throws for an unknown id. */
export function productById(id: ProductId): Product {
  const product = getProducts().find((p) => p.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
