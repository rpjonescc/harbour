import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@/lib/db/client";
import { claimNextJob, enqueueJob } from "@/lib/jobs/queue";
import { recordWorkerBeat } from "@/lib/ops/worker-beat";
import { todaySummary } from "@/lib/today/from-scans";
import { openTestDb } from "@/tests/helpers/db";
import { ago, MIN, PRODUCT_ROWS, t0, towerConfig } from "@/tests/helpers/tower";
import { loadTower } from "./load";
import { winsFacts } from "./wins-data";

vi.mock("./wins-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("./wins-data")>();
  return { ...real, winsFacts: vi.fn(real.winsFacts) };
});
vi.mock("@/lib/today/from-scans", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/today/from-scans")>();
  return { ...real, todaySummary: vi.fn(real.todaySummary) };
});

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-load-"));
  db = openTestDb();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const load = () => loadTower(db, towerConfig(dir), PRODUCT_ROWS, t0, []);

describe("loadTower", () => {
  it("reads every tile on a fresh install, with the labelled sample for the products", () => {
    recordWorkerBeat(db, ago(20_000));
    const tower = load();
    for (const tile of [tower.systems, tower.needs, tower.work, tower.runways]) {
      expect(tile.ok).toBe(true);
    }
    expect(tower.activity.ok && tower.wins.ok).toBe(true);
    expect(tower.isSample).toBe(true);
    expect(tower.briefing?.sentence).toBeTruthy();
    expect(tower.runways.ok && tower.runways.data.map((c) => c.productId)).toEqual([
      "acme-docs",
      "acme-blog",
    ]);
    expect(tower.active).toBe(false);
  });

  it("keeps the other tiles when one reader throws, and logs the failure once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(winsFacts).mockImplementationOnce(() => {
      throw new Error("disk gone");
    });
    const tower = load();
    expect(tower.wins).toEqual({ ok: false, detail: expect.stringContaining("disk gone") });
    for (const tile of [tower.systems, tower.needs, tower.work, tower.runways, tower.activity]) {
      expect(tile.ok).toBe(true);
    }
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatch(/"wins" failed: .*disk gone/);
  });

  it("fails the products tile, not the page, when the briefing can't be read", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(todaySummary).mockImplementationOnce(() => {
      throw new Error("bad scores");
    });
    const tower = load();
    expect(tower.runways.ok).toBe(false);
    expect(tower.briefing).toBeNull();
    expect(tower.isSample).toBe(false);
    expect(tower.systems.ok && tower.needs.ok).toBe(true);
  });

  it("leads the headline with a red light, which is also first in Needs you", () => {
    recordWorkerBeat(db, ago(11 * MIN));
    const tower = load();
    if (!tower.systems.ok || !tower.needs.ok) throw new Error("tiles should load");
    const worker = tower.systems.data.lights.find((l) => l.id === "worker");
    expect(worker?.tone).toBe("act");
    expect(tower.headline).toBe(worker?.sentence);
    expect(tower.needs.data.items[0]?.sentence).toBe(worker?.sentence);
    const others = tower.needs.data.items.length + tower.needs.data.more - 1;
    expect(tower.subline).toBe(
      others === 0 ? "Nothing else needs you." : expect.stringMatching(/more things? needs? you/),
    );
  });

  it("never leads with a light that is only worth a look", () => {
    // No beat at all: the worker light can't tell, which is not a red light.
    const tower = load();
    if (!tower.systems.ok) throw new Error("systems should load");
    expect(tower.systems.data.lights.find((l) => l.id === "worker")?.tone).toBe("unknown");
    expect(tower.headline).toMatch(/^Nothing is broken\. \d+ lights? (is|are) worth a look\.$/);
  });

  it("refreshes faster while a check or agent run is queued or running", () => {
    recordWorkerBeat(db, ago(20_000));
    enqueueJob(db, "scan", { productId: "acme-docs" }, null, ago(MIN));
    expect(load().active).toBe(true);
    claimNextJob(db, ago(30_000));
    expect(load().active).toBe(true);
  });
});
