import type { ContentProduct } from "@/lib/products/content";
import { scanContent } from "./scan";

const FRESH_MS = 15_000;
const cache = new Map<string, { at: number; count: number | null }>();

/**
 * Pieces Ready for you, for the sidebar. It reads through the same scan as the page (so the badge
 * and the Ready tab agree), without gate sidecars, and keeps the answer 15 seconds per brain
 * folder so a click through the app doesn't re-read every file. Null when the folder can't be
 * read: the badge is then hidden, as the brain's is.
 */
export function countReadyPieces(
  root: string,
  products: readonly ContentProduct[],
  now = Date.now(),
): number | null {
  const key = `${root}\n${products.map((p) => p.id).join(",")}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < FRESH_MS) return hit.count;
  const scan = scanContent(root, products, { gates: false });
  const count = scan.folderError
    ? null
    : [...scan.pieces.values()].flat().filter((p) => p.front.state === "ready").length;
  cache.set(key, { at: now, count });
  return count;
}
