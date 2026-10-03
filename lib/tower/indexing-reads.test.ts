import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@/lib/db/client";
import { coverage, times } from "@/tests/helpers/coverage";
import { openTestDb } from "@/tests/helpers/db";
import { seedScan } from "@/tests/helpers/scan-views";
import { ago, DAY, HOUR, PRODUCT_ROWS, t0, towerConfig } from "@/tests/helpers/tower";
import { indexingReader } from "./indexing-reads";
import { loadTower } from "./load";

// Counts every read of a scan's stored observations, by scan id.
const reads = vi.hoisted(() => ({ all: [] as number[], indexing: [] as number[] }));
vi.mock("@/lib/scan/store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/scan/store")>();
  return {
    ...real,
    scanObservations: (db: Db, scanId: number) => {
      reads.all.push(scanId);
      return real.scanObservations(db, scanId);
    },
    collectorObservations: (db: Db, scanId: number, collector: string) => {
      if (collector === "indexing") reads.indexing.push(scanId);
      return real.collectorObservations(db, scanId, collector);
    },
  };
});

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-tower-indexing-"));
  db = openTestDb();
  reads.all = [];
  reads.indexing = [];
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const indexed = (n: number) => [
  {
    collector: "indexing",
    status: "ok" as const,
    observations: coverage([...times(n, "indexed")], { total: 40 }).map(
      ({ kind, subject, value }) => ({ kind, subject, value }),
    ),
  },
];

describe("indexingReader", () => {
  it("reads a scan's indexing once, however often it is asked", () => {
    const scanId = seedScan(db, { productId: "acme-docs", at: ago(HOUR), runs: indexed(4) });
    const read = indexingReader(db);
    expect(read(scanId)).toMatchObject({ state: "counted", indexed: 4 });
    expect(read(scanId)).toMatchObject({ state: "counted", indexed: 4 });
    expect(reads.indexing).toEqual([scanId]);
    expect(reads.all).toEqual([]);
  });

  it("reads each scan once in a whole Today render, and only its indexing data", () => {
    const old = seedScan(db, { productId: "acme-docs", at: ago(8 * DAY), runs: indexed(3) });
    const latest = seedScan(db, { productId: "acme-docs", at: ago(HOUR), runs: indexed(7) });
    const tower = loadTower(db, towerConfig(dir), PRODUCT_ROWS, t0, []);
    expect(tower.wins.ok && tower.wins.data).toBeTruthy();
    // The product card and both wins counts asked; each scan was read once.
    expect(reads.indexing.sort()).toEqual([old, latest].sort());
    expect(reads.all.filter((id) => id === old || id === latest)).toEqual([]);
  });
});
