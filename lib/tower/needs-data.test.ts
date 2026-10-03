import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertAction } from "@/lib/actions/store";
import type { ContentScan } from "@/lib/content/read/scan";
import type { Db } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, finishJob } from "@/lib/jobs/queue";
import { agentAction, analystJob, ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { ago, DAY, HOUR, PRODUCT_ROWS, t0 } from "@/tests/helpers/tower";
import { needsFacts } from "./needs-data";

let db: Db;
let dir: string;

beforeEach(() => {
  db = openTestDb();
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-needs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const emptyScan: ContentScan = {
  entries: [],
  pieces: new Map(),
  capped: null,
  unreadable: [],
  folderError: false,
};

describe("needsFacts", () => {
  it("is quiet on a fresh install, leaving content out when it is off", () => {
    expect(needsFacts(db, PRODUCT_ROWS, t0, null)).toEqual({
      suggested: { count: 0, oldest: null },
      content: null,
      approvals: [],
      failedRuns: [],
      products: [
        { id: "acme-docs", name: "Acme Docs" },
        { id: "acme-blog", name: "Acme Blog" },
      ],
    });
  });

  it("counts new ideas for configured products only, with the oldest", () => {
    const source = analystJob(db);
    insertAction(db, agentAction(source, "Write a pricing page"), "agent", null, ago(3 * DAY));
    insertAction(db, agentAction(source, "Add an FAQ"), "agent", null, ago(DAY));
    insertAction(
      db,
      agentAction(source, "Elsewhere", { productId: "other" }),
      "agent",
      null,
      ago(9 * DAY),
    );
    insertAction(db, ruleAction(), "scan", null, ago(DAY));
    expect(needsFacts(db, PRODUCT_ROWS, t0, null).suggested).toEqual({
      count: 2,
      oldest: ago(3 * DAY),
    });
  });

  it("reads research targets waiting and content counts", () => {
    db.insert(proposals)
      .values({
        productId: "acme-blog",
        type: "keyword",
        value: { term: "docs" },
        key: "docs",
        why: "x",
        status: "proposed",
        createdAt: t0,
      })
      .run();
    const facts = needsFacts(db, PRODUCT_ROWS, t0, emptyScan);
    expect(facts.approvals).toEqual([
      { productId: "acme-blog", productName: "Acme Blog", count: 1 },
    ]);
    expect(facts.content).toEqual({ needsYou: 0, ready: 0 });
    expect(
      needsFacts(db, PRODUCT_ROWS, t0, { ...emptyScan, folderError: true }).content,
    ).toBeNull();
  });

  it("lists agent runs that failed in 24 h and were not retried", () => {
    const run = (params: Record<string, string>, status: "ok" | "failed", at: Date) => {
      const { id } = enqueueJob(db, "discovery", params, null, at);
      claimNextJob(db, at);
      finishJob(db, id, status, status === "failed" ? "boom" : null, at);
      return id;
    };
    run({ productId: "acme-docs" }, "failed", ago(30 * HOUR)); // too old
    const failed = run({ productId: "acme-blog" }, "failed", ago(2 * HOUR));
    expect(needsFacts(db, PRODUCT_ROWS, t0, null).failedRuns.map((j) => j.id)).toEqual([failed]);
    run({ productId: "acme-docs" }, "ok", ago(HOUR)); // a later success of the same kind
    expect(needsFacts(db, PRODUCT_ROWS, t0, null).failedRuns).toEqual([]);
  });
});
