import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { queueScans } from "./scan-now";

const products = [{ id: "acme-docs" }, { id: "acme-blog" }];

describe("queueScans", () => {
  it("queues a scan for every product, in display order", () => {
    const db = openTestDb();
    const queued = queueScans(db, products);
    expect(queued.map((q) => [q.productId, q.created])).toEqual([
      ["acme-docs", true],
      ["acme-blog", true],
    ]);
    expect(listJobs(db).map((j) => [j.kind, j.params.productId])).toEqual([
      ["scan", "acme-blog"],
      ["scan", "acme-docs"],
    ]);
  });

  it("queues only the product asked for", () => {
    const db = openTestDb();
    expect(queueScans(db, products, "acme-blog").map((q) => q.productId)).toEqual(["acme-blog"]);
    expect(listJobs(db)).toHaveLength(1);
  });

  it("rejects an unknown product without queueing anything", () => {
    const db = openTestDb();
    expect(() => queueScans(db, products, "acme-shop")).toThrow(
      "Unknown product: acme-shop (configured: acme-docs, acme-blog)",
    );
    expect(listJobs(db)).toHaveLength(0);
  });

  it("does not queue a second scan while one is queued", () => {
    const db = openTestDb();
    queueScans(db, products);
    expect(queueScans(db, products).every((q) => !q.created)).toBe(true);
    expect(listJobs(db)).toHaveLength(2);
  });

  it("fails when no products are configured", () => {
    expect(() => queueScans(openTestDb(), [])).toThrow("No products configured");
  });
});
