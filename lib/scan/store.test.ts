import { eq } from "drizzle-orm";
import { scanRuns } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, finishJob, type Job } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import {
  failInterruptedScans,
  finishScan,
  latestOkObservations,
  recordCollectorRun,
  startScan,
} from "./store";
import type { CollectorStatus } from "./types";

const t0 = new Date("2026-10-01T06:00:00Z");
const day = (n: number) => new Date(t0.getTime() + n * 24 * 60 * 60_000);

function setup() {
  const db = openTestDb();
  let next = 0;
  const job = (): Job => {
    enqueueJob(db, "scan", { productId: `p${next++}` }, null, t0);
    const claimed = claimNextJob(db, t0);
    if (!claimed) throw new Error("expected a claimed job");
    return claimed;
  };
  /** One finished scan with a single collector run. */
  const scan = (
    productId: string,
    collector: string,
    status: CollectorStatus,
    at: Date,
    subjects: string[] = [],
  ) => {
    const scanId = startScan(db, productId, job().id, at);
    recordCollectorRun(db, {
      scanId,
      collector,
      status,
      error: status === "ok" ? null : "why",
      startedAt: at,
      finishedAt: at,
      observations:
        status === "ok"
          ? subjects.map((subject) => ({ kind: "cwv", subject, value: { lcpMs: 1 } }))
          : undefined,
    });
    finishScan(db, scanId, status === "failed" ? "failed" : "ok", at);
  };
  return { db, job, scan };
}

describe("latestOkObservations", () => {
  it("returns the observations of the latest ok run for that product and collector", () => {
    const { db, scan } = setup();
    scan("acme-docs", "pagespeed", "ok", day(0), ["https://docs.example.com/old"]);
    scan("acme-docs", "pagespeed", "ok", day(7), ["https://docs.example.com/"]);
    scan("acme-docs", "pagespeed", "failed", day(8));
    scan("acme-docs", "pagespeed", "skipped", day(9));
    scan("acme-docs", "crawler", "ok", day(9), ["https://docs.example.com/crawl"]);
    scan("fern-and-field", "pagespeed", "ok", day(9), ["https://fernandfield.example.com/"]);
    expect(latestOkObservations(db, "acme-docs", "pagespeed")).toEqual({
      finishedAt: day(7),
      observations: [{ kind: "cwv", subject: "https://docs.example.com/", value: { lcpMs: 1 } }],
    });
  });

  it("returns the run even when it stored no observations", () => {
    const { db, scan } = setup();
    scan("acme-docs", "pagespeed", "ok", day(1));
    expect(latestOkObservations(db, "acme-docs", "pagespeed")).toEqual({
      finishedAt: day(1),
      observations: [],
    });
  });

  it("is null when the collector never ran ok for the product", () => {
    const { db, scan } = setup();
    scan("acme-docs", "pagespeed", "failed", day(1));
    scan("fern-and-field", "pagespeed", "ok", day(1));
    expect(latestOkObservations(db, "acme-docs", "pagespeed")).toBeNull();
    expect(latestOkObservations(db, "lighthouse-cafe", "pagespeed")).toBeNull();
  });
});

describe("failInterruptedScans", () => {
  it("marks running scans whose job is no longer running as failed", () => {
    const { db, job } = setup();
    const { id: jobId } = job();
    const scanId = startScan(db, "acme-docs", jobId, t0);
    expect(failInterruptedScans(db, day(1))).toBe(0); // its job is still running: leave it
    finishJob(db, jobId, "failed", "Worker stopped");
    expect(failInterruptedScans(db, day(1))).toBe(1);
    const row = db.select().from(scanRuns).where(eq(scanRuns.id, scanId)).get();
    expect(row).toMatchObject({ status: "failed", finishedAt: day(1) });
  });
});
