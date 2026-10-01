import { pathToFileURL } from "node:url";
import type { Db } from "@/lib/db/client";
import { enqueueScan } from "@/lib/jobs/scan-schedule";
import type { Product } from "@/lib/products/catalog";

export type QueuedScanJob = { id: number; productId: string; created: boolean };

/** Queues a scan of one product, or of every product when `productId` is omitted. */
export function queueScans(
  db: Db,
  products: readonly Pick<Product, "id">[],
  productId?: string,
): QueuedScanJob[] {
  const ids = products.map((p) => p.id);
  if (productId !== undefined && !ids.includes(productId)) {
    throw new Error(`Unknown product: ${productId} (configured: ${ids.join(", ")})`);
  }
  return ids
    .filter((id) => productId === undefined || id === productId)
    .map((id) => ({ ...enqueueScan(db, id, null), productId: id }));
}

async function main() {
  // Imported lazily so the unit test never loads the real database or config.
  const { getDb } = await import("@/lib/db/client");
  const { getProducts } = await import("@/lib/products/catalog");
  for (const job of queueScans(getDb(), getProducts(), process.argv[2])) {
    console.log(`${job.created ? "queued" : "already queued"} #${job.id} scan ${job.productId}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
