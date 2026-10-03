import { getConfig } from "@/lib/config";
import { MICRO_PER_AUD } from "@/lib/costs/budget";
import { actions, costs, externalChecks } from "@/lib/db/schema";
import {
  type FakeTregOptions,
  fakeFetch,
  fakeTreg,
  KEY,
  TRACKING,
} from "@/tests/helpers/fake-treg";
import { closeSites } from "@/tests/helpers/http-site";
import { DAY, runsOf, setup, texts } from "@/tests/helpers/scan-run";
import { createTreg } from "./collectors/treg";
import { outsideView } from "./outside-view";
import { workerScanDeps } from "./worker-deps";

const store = vi.hoisted(() => ({ failCopy: false }));
vi.mock("@/lib/external/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/external/store")>();
  return {
    ...actual,
    saveExternalChecks: (...args: Parameters<typeof actual.saveExternalChecks>) => {
      if (store.failCopy) throw new Error("disk full");
      return actual.saveExternalChecks(...args);
    },
  };
});

afterEach(closeSites);
afterEach(() => {
  store.failCopy = false;
});

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);

/** A scan of Acme Docs with only the Treg collector, pointed at a fake Treg. */
async function tregScan(options: FakeTregOptions = {}, capAud = 1, key: string | null = KEY) {
  const server = await fakeTreg(options);
  const collector = createTreg({
    tracking: () => TRACKING,
    baseUrl: server.origin,
    timeoutMs: 5_000,
    clock: Date.now,
  });
  const harness = setup([collector], {
    config: { ...getConfig(), HARBOUR_TREG_API_KEY: key ?? undefined, HARBOUR_USD_TO_AUD: 1.55 },
    fetch: fakeFetch(),
    budget: { capMicroAud: A$(capAud), timeZone: "UTC" },
  });
  return { ...harness, server };
}

describe("runScan with the Treg collector", () => {
  it("reserves before each call and settles at the reported charge, with job and product", async () => {
    const { db, scan, server } = await tregScan();
    const job = await scan();
    expect(server.calls).toHaveLength(4);
    expect(runsOf(db)[0]).toMatchObject({ collector: "treg", status: "ok" });
    const rows = db.select().from(costs).orderBy(costs.id).all();
    expect(rows.map((r) => [r.status, r.provider, r.amountMicroAud])).toEqual([
      ["recorded", "treg", 3_875],
      ["recorded", "treg", 9_300],
      ["recorded", "treg", 9_300],
      ["recorded", "treg", 5_580],
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        collector: "treg",
        productId: "acme-docs",
        jobId: job.id,
        units: 1,
      });
    }
  });

  it("stops at the budget with partial results kept and no stray reservation", async () => {
    const { db, scan, server } = await tregScan({}, 0.02);
    await scan();
    expect(server.calls).toHaveLength(2);
    expect(runsOf(db)[0]).toMatchObject({ status: "ok", items: 3 });
    const rows = db.select().from(costs).all();
    expect(rows.map((r) => r.status)).toEqual(["recorded", "recorded"]);
  });

  it("is skipped before any call when no monthly budget is set", async () => {
    const { db, scan, server } = await tregScan({}, 0);
    await scan();
    expect(server.calls).toEqual([]);
    expect(runsOf(db)[0]).toMatchObject({
      status: "skipped",
      error: "budget: no monthly budget set (HARBOUR_MONTHLY_BUDGET_AUD)",
    });
  });

  it("runs weekly: skipped the next day, due again after a week", async () => {
    const { db, scan, advance, server } = await tregScan();
    await scan();
    expect(server.calls).toHaveLength(4);
    advance(DAY);
    await scan();
    expect(runsOf(db)[1]).toMatchObject({
      status: "skipped",
      error: "runs weekly; last ran 2026-10-01",
    });
    expect(server.calls).toHaveLength(4);
    advance(6 * DAY);
    await scan();
    expect(runsOf(db)[2]).toMatchObject({ status: "ok" });
    expect(server.calls).toHaveLength(8);
  });

  it("does not wait a week after a failed run: an outage is retried at the next scan", async () => {
    let mode: "server_error" | "ok" = "server_error";
    const { db, scan, advance, server } = await tregScan({ mode: () => mode });
    await scan();
    expect(runsOf(db)[0]).toMatchObject({ status: "failed" });
    mode = "ok";
    advance(DAY);
    await scan();
    expect(runsOf(db)[1]).toMatchObject({ status: "ok" });
    expect(server.calls.length).toBeGreaterThan(4);
  });

  it("is not configured without a key: no calls, no cost", async () => {
    const { db, scan, server } = await tregScan({}, 1, null);
    await scan();
    expect(server.calls).toEqual([]);
    expect(runsOf(db)[0]).toMatchObject({ status: "not_configured" });
    expect(db.select().from(costs).all()).toEqual([]);
  });

  it("keeps the key out of events, run errors and the ledger when Treg refuses it", async () => {
    const { db, scan } = await tregScan({ mode: "unauthorized" });
    const job = await scan();
    const stored = JSON.stringify([runsOf(db), texts(db, job), db.select().from(costs).all()]);
    expect(stored).not.toContain(KEY);
    expect(runsOf(db)[0]).toMatchObject({
      status: "failed",
      error:
        "Treg refused Harbour's key: check HARBOUR_TREG_API_KEY in .env, then restart the worker.",
    });
  });

  it.each([
    ["a 401", "unauthorized"],
    ["a 402 balance", "balance"],
    ["a 429", "rate_limit"],
    ["a 503", "server_error"],
  ] as const)("leaves no reservation behind after %s", async (_name, mode) => {
    const { db, scan } = await tregScan({ mode });
    await scan();
    expect(runsOf(db)[0]).toMatchObject({ status: "failed" });
    const rows = db.select().from(costs).all();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.status === "reserved")).toEqual([]);
    expect(rows.reduce((sum, r) => sum + r.amountMicroAud, 0)).toBe(0);
  });

  it("settles each call against its own reservation: a 503 then successes logs no cost warning", async () => {
    const { db, scan } = await tregScan({ mode: (_e, n) => (n === 1 ? "server_error" : "ok") });
    const job = await scan();
    expect(runsOf(db)[0]).toMatchObject({ status: "ok" });
    expect(texts(db, job).join("\n")).not.toContain("above its");
    const rows = db.select().from(costs).orderBy(costs.id).all();
    expect(rows.map((r) => r.amountMicroAud)).toEqual([0, 9_300, 9_300, 5_580]);
    expect(rows.every((r) => r.status === "recorded")).toBe(true);
  });

  it("waits two days after calls that may have been billed came to nothing, then tries again", async () => {
    const { db, scan, advance, server } = await tregScan({ mode: "huge" });
    await scan();
    expect(runsOf(db)[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("waits two days"),
    });
    const calls = server.calls.length;
    advance(DAY);
    await scan();
    expect(runsOf(db)[1]).toMatchObject({
      status: "skipped",
      error: "backing off for two days after calls that may have been billed came to nothing",
    });
    expect(server.calls).toHaveLength(calls);
    // Two days less the usual 12 h of slack: a scan 36 h after the failure tries again.
    advance(DAY / 2);
    await scan();
    expect(runsOf(db)[2]?.status).toBe("failed");
    expect(server.calls.length).toBeGreaterThan(calls);
  });

  it("copies the week's checks into the history and lets the rules see them", async () => {
    // Four linking sites, all outside: under the 5 the rule wants (and the list call is made).
    const { db, deps, scan } = await tregScan({ answers: { referringDomains: 4 } });
    deps.afterScore = workerScanDeps(deps).afterScore;
    const job = await scan();
    expect(db.select().from(externalChecks).all()).toHaveLength(4);
    expect(texts(db, job).join("\n")).toContain("Outside view: kept 4 new checks");
    // The fake reports 4 referring sites, under the 5 the rule wants.
    const raised = db
      .select()
      .from(actions)
      .all()
      .filter((a) => a.ruleKey === "few-referring-sites");
    expect(raised).toHaveLength(1);
  });

  it("tells the page why a scheduled run answered only part", async () => {
    const { db, scan } = await tregScan({}, 0.02);
    await scan();
    const view = outsideView({
      db,
      config: { ...getConfig(), HARBOUR_TREG_API_KEY: KEY },
      product: { id: "acme-docs", url: "https://docs.example.com" },
      tracking: TRACKING,
      now: new Date("2026-10-01T07:00:00Z"),
    });
    expect(view.notice).toBe("partial_budget");
  });

  it("catches up the checks of an earlier scan whose copy was missed", async () => {
    const { db, deps, scan, advance } = await tregScan();
    await scan(); // no afterScore yet: nothing copied
    expect(db.select().from(externalChecks).all()).toEqual([]);
    deps.afterScore = workerScanDeps(deps).afterScore;
    advance(DAY);
    const job = await scan(); // the weekly check is skipped, but the last one's checks are copied
    expect(db.select().from(externalChecks).all()).toHaveLength(4);
    expect(texts(db, job).join("\n")).toContain("Outside view: kept 4 new checks");
    advance(DAY);
    await scan();
    expect(db.select().from(externalChecks).all()).toHaveLength(4);
  });

  it("reports a failed copy instead of failing the scan, and the action sync still runs", async () => {
    const { db, deps, scan } = await tregScan();
    deps.afterScore = workerScanDeps(deps).afterScore;
    store.failCopy = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const job = await scan();
    error.mockRestore();
    expect(texts(db, job).join("\n")).toContain("Outside view: could not keep the checks");
    expect(texts(db, job).join("\n")).toContain("Actions:");
  });
});
