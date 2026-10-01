import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs, proposals, scanRuns } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { daysAfter, seedScan } from "@/tests/helpers/scan-views";
import { approvalsWaiting, syncFailures } from "./board-notices";
import { ACTION_SYNC_FAILED } from "./sync-error";

const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "acme-shop", name: "Acme Shop" },
];

function failSync(db: Db, scanId: number, at: Date) {
  const scan = db.select().from(scanRuns).where(eq(scanRuns.id, scanId)).get();
  if (!scan) throw new Error("no scan");
  db.update(jobs)
    .set({ status: "failed", error: `${ACTION_SYNC_FAILED}: disk full`, finishedAt: at })
    .where(eq(jobs.id, scan.jobId))
    .run();
}

describe("syncFailures", () => {
  it("lists products whose latest scan job failed only at the action sync", () => {
    const db = openTestDb();
    failSync(db, seedScan(db, { productId: "acme-docs", at: daysAfter(0) }), daysAfter(0));
    seedScan(db, { productId: "acme-shop", at: daysAfter(0) });
    expect(syncFailures(db, PRODUCTS)).toEqual([{ productName: "Acme Docs", at: daysAfter(0) }]);
  });

  it("clears once a later scan succeeds", () => {
    const db = openTestDb();
    failSync(db, seedScan(db, { productId: "acme-docs", at: daysAfter(0) }), daysAfter(0));
    seedScan(db, { productId: "acme-docs", at: daysAfter(1) });
    expect(syncFailures(db, PRODUCTS)).toEqual([]);
  });

  it("ignores scans that failed for another reason", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(0), status: "failed" });
    expect(syncFailures(db, PRODUCTS)).toEqual([]);
  });
});

describe("approvalsWaiting", () => {
  it("counts proposed research targets per configured product", () => {
    const db = openTestDb();
    const add = (productId: string, key: string, status: "proposed" | "approved") =>
      db
        .insert(proposals)
        .values({
          productId,
          type: key.startsWith("q") ? "question" : "keyword",
          value: { term: key },
          key,
          why: "why",
          status,
          createdAt: daysAfter(0),
        })
        .run();
    add("acme-docs", "k1", "proposed");
    add("acme-docs", "q1", "proposed");
    add("acme-docs", "k2", "approved");
    add("acme-shop", "k1", "approved");
    add("other", "k1", "proposed");
    expect(approvalsWaiting(db, PRODUCTS)).toEqual([
      { productId: "acme-docs", productName: "Acme Docs", count: 2 },
    ]);
  });
});
