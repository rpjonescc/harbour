import { RESEARCH_TOPICS } from "@/lib/agents/topics";
import { listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { queueInitialRun } from "./queue-initial-run";

const products = [{ id: "acme-docs" }, { id: "acme-blog" }];

describe("queueInitialRun", () => {
  it("queues every research topic, then one discovery job per product", () => {
    const db = openTestDb();
    const queued = queueInitialRun(db, products);
    expect(queued).toHaveLength(RESEARCH_TOPICS.length + products.length);
    expect(RESEARCH_TOPICS).toHaveLength(10);
    expect(queued.slice(0, 10).map((j) => j.kind)).toEqual(Array(10).fill("research"));
    expect(queued.slice(10).map((j) => [j.kind, j.target])).toEqual([
      ["discovery", "acme-docs"],
      ["discovery", "acme-blog"],
    ]);
    const ids = queued.map((j) => j.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(listJobs(db, 50)).toHaveLength(12);
  });

  it("is idempotent while the jobs are still queued", () => {
    const db = openTestDb();
    queueInitialRun(db, products);
    const again = queueInitialRun(db, products);
    expect(again.every((j) => !j.created)).toBe(true);
    expect(listJobs(db, 50)).toHaveLength(12);
  });
});
