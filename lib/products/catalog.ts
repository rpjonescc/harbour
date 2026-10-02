import { getConfig } from "@/lib/config";
import {
  type Hue,
  type LoadedProductConfig,
  loadProductConfig,
  ownerFirstName,
  type ProductKind,
} from "./config";

export type { Hue, ProductKind } from "./config";

export type ProductId = string;

export type Product = {
  id: ProductId;
  name: string;
  url: string;
  hue: Hue;
  /** "news" keeps Preferred Sources in its AEO score; "product" (the default) does not. */
  kind: ProductKind;
  /** Search Console property to query, e.g. "sc-domain:example.com"; unset = not connected. */
  searchConsoleProperty?: string;
};

const EXAMPLE_CONFIG_PATH = "./harbour.config.example.json";

let cached: LoadedProductConfig | undefined;

/** Process-wide product config (products plus whether it is the demo example), loaded once. */
export function getProductConfig(): LoadedProductConfig {
  cached ??= loadProductConfig(getConfig().HARBOUR_CONFIG_PATH, EXAMPLE_CONFIG_PATH);
  return cached;
}

/** The owner's first name from `harbour.config.json`, or null. Never logged. */
export function getOwnerFirstName(): string | null {
  return ownerFirstName(getProductConfig().ownerName);
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
