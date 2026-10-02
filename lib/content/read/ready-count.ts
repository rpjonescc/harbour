import type { ContentProduct } from "@/lib/products/content";
import { readIdeas } from "./ideas";
import { readPieces } from "./pieces";

const NEWEST = 50;

/** Pieces Ready for you, for the sidebar: only the newest drafted ideas are looked at, so it stays cheap. */
export function countReadyPieces(root: string, products: readonly ContentProduct[]): number {
  return products.reduce((total, product) => {
    const drafted = readIdeas(root, product.id, NEWEST).ideas.filter(
      (i) => i.front.state === "drafted",
    );
    return (
      total +
      drafted.reduce(
        (n, idea) =>
          n + readPieces(root, idea.id).pieces.filter((p) => p.front.state === "ready").length,
        0,
      )
    );
  }, 0);
}
