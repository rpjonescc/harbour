import { pathToFileURL } from "node:url";
import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import type { Db } from "@/lib/db/client";
import { enqueueJob } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";

export type QueuedJob = {
  id: number;
  kind: "research" | "discovery";
  target: string;
  created: boolean;
};

/** Queues every research topic, then discovery for each product (queue order is run order). */
export function queueInitialRun(db: Db, products: readonly Pick<Product, "id">[]): QueuedJob[] {
  const queued: QueuedJob[] = [];
  for (const topic of RESEARCH_TOPICS) {
    const job = enqueueJob(db, "research", { topic: topic.id }, null);
    queued.push({ ...job, kind: "research", target: topic.id });
  }
  for (const product of products) {
    const job = enqueueJob(db, "discovery", { productId: product.id }, null);
    queued.push({ ...job, kind: "discovery", target: product.id });
  }
  return queued;
}

async function main() {
  // Imported lazily so the unit test never loads the real database or config.
  const { getDb } = await import("@/lib/db/client");
  const { getProducts } = await import("@/lib/products/catalog");
  for (const job of queueInitialRun(getDb(), getProducts())) {
    console.log(
      `${job.created ? "queued" : "already queued"} #${job.id} ${job.kind} ${job.target}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
