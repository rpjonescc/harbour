import type { Config } from "@/lib/config";
import { type ContentScan, scanContent } from "@/lib/content/read/scan";
import type { ContentProduct } from "@/lib/products/content";

const FRESH_MS = 15_000;
const cache = new Map<string, { at: number; scan: ContentScan }>();

/**
 * The one content read per tower render (the existing 200 ideas and 600 pieces caps, no gate
 * files), kept 15 seconds per brain folder like the sidebar count, so a quick refresh doesn't
 * re-read every file. Null when content is off, so every content line and item is left out.
 */
export function towerContentScan(
  config: Config,
  products: readonly ContentProduct[],
  now = Date.now(),
): ContentScan | null {
  if (config.HARBOUR_CONTENT !== "on") return null;
  const root = config.HARBOUR_BRAIN_DIR;
  const key = `${root}\n${products.map((p) => p.id).join(",")}`;
  const hit = cache.get(key);
  if (hit && now - hit.at >= 0 && now - hit.at < FRESH_MS) return hit.scan;
  const scan = scanContent(root, products, { gates: false });
  cache.set(key, { at: now, scan });
  return scan;
}
