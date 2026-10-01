import { eq } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { collectorRuns, observations, scanRuns, scores } from "@/lib/db/schema";
import {
  claimNextJob,
  enqueueJob,
  eventsSince,
  finishJob,
  getJob,
  type Job,
  requestCancel,
} from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { openTestDb } from "@/tests/helpers/db";
import { runScan, type ScanDeps } from "./run-scan";
import { failInterruptedScans } from "./store";
import type { Collector, CollectorResult, ScanScores, ScoreScan } from "./types";

const DAY = 24 * 60 * 60_000;
const t0 = new Date("2026-10-01T06:00:00Z");
const product: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
};

const page = (path: string) => ({
  kind: "page",
  subject: `https://docs.example.com${path}`,
  value: { status: 200 },
});

function fake(
  id: string,
  collect: Collector["collect"],
  cadence: Collector["cadence"] = "daily",
): Collector & { calls: number } {
  const collector = {
    id,
    cadence,
    calls: 0,
    collect: (ctx: Parameters<Collector["collect"]>[0]) => {
      collector.calls += 1;
      return collect(ctx);
    },
  };
  return collector;
}

const returns = (id: string, result: CollectorResult, cadence?: Collector["cadence"]) =>
  fake(id, async () => result, cadence);

const ok = (id: string, n = 1, cadence?: Collector["cadence"]) =>
  returns(
    id,
    { status: "ok", observations: Array.from({ length: n }, (_, i) => page(`/${i}`)) },
    cadence,
  );

const throws = (id: string) =>
  fake(id, async () => {
    throw new Error("connection refused");
  });

/** Never settles on its own; resolves only when its signal aborts (like a well-behaved fetch). */
const hangs = (id: string) =>
  fake(
    id,
    (ctx) =>
      new Promise<CollectorResult>((_, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );

function setup(collectors: Collector[], over: Partial<ScanDeps> = {}) {
  const db = openTestDb();
  let now = t0;
  const deps: ScanDeps = {
    db,
    config: getConfig(),
    products: [product],
    collectors,
    fetch: async () => {
      throw new Error("no network in tests");
    },
    scoreScan: () => null,
    now: () => now,
    stopping: () => false,
    timeoutMs: () => 1000,
    pollMs: 5,
    ...over,
  };
  const claim = (productId = product.id): Job => {
    enqueueJob(db, "scan", { productId }, null, now);
    const job = claimNextJob(db, now);
    if (!job) throw new Error("expected a claimed job");
    return job;
  };
  const scan = async (productId?: string) => {
    const job = claim(productId);
    await runScan(deps, job);
    return job;
  };
  return {
    db,
    deps,
    claim,
    scan,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

const runsOf = (db: Db) =>
  db
    .select({
      collector: collectorRuns.collector,
      status: collectorRuns.status,
      error: collectorRuns.error,
      items: collectorRuns.items,
    })
    .from(collectorRuns)
    .orderBy(collectorRuns.id)
    .all();

const scanStatus = (db: Db) => db.select().from(scanRuns).all().at(-1)?.status;
const texts = (db: Db, job: Job) => eventsSince(db, job.id, 0).map((e) => e.text);

describe("runScan", () => {
  it("records each collector's outcome and stores observations only for ok runs", async () => {
    const { db, scan } = setup([
      ok("crawler", 3),
      throws("readiness"),
      returns("search-console", { status: "not_configured", reason: "add credentials" }),
    ]);
    const job = await scan();
    expect(runsOf(db)).toEqual([
      { collector: "crawler", status: "ok", error: null, items: 3 },
      { collector: "readiness", status: "failed", error: "connection refused", items: null },
      {
        collector: "search-console",
        status: "not_configured",
        error: "add credentials",
        items: null,
      },
    ]);
    const stored = db.select().from(observations).all();
    expect(stored).toHaveLength(3);
    expect(stored.every((o) => o.collector === "crawler")).toBe(true);
    expect(stored[0]?.value).toEqual({ status: 200 });
    expect(scanStatus(db)).toBe("partial");
    expect(getJob(db, job.id)?.status).toBe("ok");
    expect(texts(db, job)).toEqual(
      expect.arrayContaining([
        "Crawler: 3 observations",
        "Readiness: failed — connection refused",
        "Search Console: not connected — add credentials",
      ]),
    );
  });

  it("is ok when every collector is ok, not configured or skipped", async () => {
    const { db, scan } = setup([
      ok("crawler"),
      returns("pagespeed", { status: "skipped", reason: "no URL" }),
      returns("search-console", { status: "not_configured", reason: "add credentials" }),
    ]);
    const job = await scan();
    expect(scanStatus(db)).toBe("ok");
    const finished = db.select().from(scanRuns).get();
    expect(finished?.finishedAt).toEqual(t0);
    expect(finished?.jobId).toBe(job.id);
    expect(getJob(db, job.id)).toMatchObject({ status: "ok", error: null });
  });

  it("fails the scan and the job when every collector fails", async () => {
    const { db, scan } = setup([throws("crawler"), throws("readiness")]);
    const job = await scan();
    expect(scanStatus(db)).toBe("failed");
    expect(getJob(db, job.id)).toMatchObject({ status: "failed", error: "All collectors failed" });
  });

  it("aborts a collector that runs past its timeout and carries on with the next", async () => {
    const slow = hangs("crawler");
    const next = ok("readiness");
    const { db, scan } = setup([slow, next], { timeoutMs: (id) => (id === "crawler" ? 20 : 1000) });
    await scan();
    expect(runsOf(db)[0]).toMatchObject({ status: "failed", error: "Timed out after 0.02 s" });
    expect(next.calls).toBe(1);
    expect(scanStatus(db)).toBe("partial");
  });

  it("treats a collector that ignores its abort signal as timed out", async () => {
    const stubborn = fake("crawler", () => new Promise<CollectorResult>(() => {}));
    const { db, scan } = setup([stubborn], { timeoutMs: () => 20 });
    await scan();
    expect(runsOf(db)[0]?.status).toBe("failed");
  });

  it("skips a weekly collector whose last ok run is under 7 days old", async () => {
    const weekly = ok("pagespeed", 1, "weekly");
    const { db, scan, advance } = setup([weekly]);
    await scan();
    advance(6 * DAY);
    await scan();
    expect(weekly.calls).toBe(1);
    expect(runsOf(db)[1]).toMatchObject({ status: "skipped", items: null });
    expect(runsOf(db)[1]?.error).toMatch(/weekly/);
    advance(DAY + 1);
    await scan();
    expect(weekly.calls).toBe(2);
  });

  it("does not let a failed weekly run or another product's run delay the next one", async () => {
    let fail = true;
    const weekly = fake(
      "pagespeed",
      async () => {
        if (fail) throw new Error("quota");
        return { status: "ok", observations: [] };
      },
      "weekly",
    );
    const other = { ...product, id: "fern-and-field" };
    const { scan, deps } = setup([weekly]);
    deps.products = [product, other];
    await scan();
    fail = false;
    await scan();
    await scan("fern-and-field");
    expect(weekly.calls).toBe(3);
  });

  it("stops at a cancel request and does not run the remaining collectors", async () => {
    const env = setup([]);
    const first = fake("crawler", (ctx) => {
      requestCancel(env.db, job.id);
      return hangs("x").collect(ctx);
    });
    const rest = ok("readiness");
    env.deps.collectors = [first, rest];
    const job = env.claim();
    await runScan(env.deps, job);
    expect(rest.calls).toBe(0);
    expect(runsOf(env.db)).toEqual([
      { collector: "crawler", status: "failed", error: "Cancelled", items: null },
    ]);
    expect(scanStatus(env.db)).toBe("failed");
    expect(getJob(env.db, job.id)?.status).toBe("cancelled");
  });

  it("stops when the worker is shutting down", async () => {
    let stopping = false;
    const first = fake("crawler", (ctx) => {
      stopping = true;
      return hangs("x").collect(ctx);
    });
    const rest = ok("readiness");
    const { db, scan } = setup([first, rest], { stopping: () => stopping });
    const job = await scan();
    expect(rest.calls).toBe(0);
    expect(getJob(db, job.id)).toMatchObject({ status: "cancelled", error: "Worker stopped" });
  });

  it("scores the scan's observations and stores the result", async () => {
    const seen: Parameters<ScoreScan>[] = [];
    const result: ScanScores = {
      formulaVersion: "test",
      seo: 80,
      geo: null,
      aeo: 40,
      complete: { seo: true, geo: false, aeo: true },
      breakdown: [],
    };
    const { db, scan } = setup([ok("crawler", 2), throws("readiness")], {
      scoreScan: (...args) => {
        seen.push(args);
        return result;
      },
    });
    await scan();
    expect(seen[0]?.[0]).toHaveLength(2);
    expect(seen[0]?.[0][0]).toMatchObject({ collector: "crawler", kind: "page" });
    expect(seen[0]?.[1]).toEqual({ crawler: "ok", readiness: "failed" });
    expect(db.select().from(scores).get()).toMatchObject({
      productId: "acme-docs",
      formulaVersion: "test",
      seo: 80,
      geo: null,
      aeo: 40,
      complete: { seo: true, geo: false, aeo: true },
    });
  });

  it("writes no score row while scoring returns null", async () => {
    const { db, scan } = setup([ok("crawler")]);
    await scan();
    expect(db.select().from(scores).all()).toEqual([]);
  });

  it("turns collector log lines into job events", async () => {
    const chatty = fake("crawler", async (ctx) => {
      ctx.log("143 pages");
      return { status: "ok", observations: [] };
    });
    const { db, scan } = setup([chatty]);
    const job = await scan();
    expect(texts(db, job)).toContain("Crawler: 143 pages");
  });

  it("fails the job for an unknown product without starting a scan", async () => {
    const crawler = ok("crawler");
    const { db, scan } = setup([crawler]);
    const job = await scan("nope");
    expect(getJob(db, job.id)).toMatchObject({ status: "failed", error: "Unknown product: nope" });
    expect(db.select().from(scanRuns).all()).toEqual([]);
    expect(crawler.calls).toBe(0);
  });

  it("rejects a collector that returns more observations than the cap", async () => {
    const { db, scan } = setup([ok("crawler", 3)], { maxObservations: 2 });
    await scan();
    expect(runsOf(db)[0]).toMatchObject({ status: "failed", items: null });
    expect(db.select().from(observations).all()).toEqual([]);
  });
});

describe("failInterruptedScans", () => {
  it("marks scans left running by a stopped worker as failed", async () => {
    const { db, claim } = setup([]);
    const job = claim();
    db.insert(scanRuns)
      .values({ productId: "acme-docs", jobId: job.id, startedAt: t0, status: "running" })
      .run();
    finishJob(db, job.id, "failed", "Worker stopped");
    expect(failInterruptedScans(db, t0)).toBe(1);
    const row = db.select().from(scanRuns).where(eq(scanRuns.jobId, job.id)).get();
    expect(row).toMatchObject({ status: "failed", finishedAt: t0 });
  });
});
