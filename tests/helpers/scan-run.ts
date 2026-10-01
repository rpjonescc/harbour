/** Fixtures for runScan tests: fake collectors and a scan set up on a fresh database. */
import { getConfig } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { collectorRuns, scanRuns } from "@/lib/db/schema";
import { claimNextJob, enqueueJob, eventsSince, type Job } from "@/lib/jobs/queue";
import type { Product } from "@/lib/products/catalog";
import { runScan, type ScanDeps } from "@/lib/scan/run-scan";
import type { Collector, CollectorResult } from "@/lib/scan/types";
import { openTestDb } from "@/tests/helpers/db";

export const DAY = 24 * 60 * 60_000;
export const t0 = new Date("2026-10-01T06:00:00Z");
export const product: Product = {
  id: "acme-docs",
  name: "Acme Docs",
  url: "https://docs.example.com",
  hue: "amber",
};

export const page = (path: string) => ({
  kind: "page",
  subject: `https://docs.example.com${path}`,
  value: { status: 200 },
});

export function fake(
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

export const returns = (id: string, result: CollectorResult, cadence?: Collector["cadence"]) =>
  fake(id, async () => result, cadence);

export const ok = (id: string, n = 1, cadence?: Collector["cadence"]) =>
  returns(
    id,
    { status: "ok", observations: Array.from({ length: n }, (_, i) => page(`/${i}`)) },
    cadence,
  );

export const throws = (id: string) =>
  fake(id, async () => {
    throw new Error("connection refused");
  });

/** Never settles on its own; resolves only when its signal aborts (like a well-behaved fetch). */
export const hangs = (id: string) =>
  fake(
    id,
    (ctx) =>
      new Promise<CollectorResult>((_, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );

export function setup(collectors: Collector[], over: Partial<ScanDeps> = {}) {
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

export const runsOf = (db: Db) =>
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

export const scanStatus = (db: Db) => db.select().from(scanRuns).all().at(-1)?.status;
export const texts = (db: Db, job: Job) => eventsSince(db, job.id, 0).map((e) => e.text);
