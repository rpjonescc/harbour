import { sql } from "drizzle-orm";
import { costs } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { type CostEntry, recordCost, spentBetween } from "./ledger";

const NOW = new Date("2026-10-15T12:00:00Z");
const entry: CostEntry = {
  provider: "dataforseo",
  collector: "rankings",
  productId: "acme-docs",
  units: 1,
  amountMicroAud: 900,
  jobId: null,
};

describe("recordCost", () => {
  it("stores one row per paid call", () => {
    const db = openTestDb();
    const job = enqueueJob(db, "scan", { productId: "acme-docs" }, null, NOW);
    recordCost(db, { ...entry, jobId: job.id }, NOW);
    expect(db.select().from(costs).all()).toEqual([
      { id: 1, createdAt: NOW, ...entry, jobId: job.id },
    ]);
  });

  it("refuses a row above A$100: a unit-price bug, not a real call", () => {
    const db = openTestDb();
    recordCost(db, { ...entry, amountMicroAud: 100_000_000 }, NOW);
    expect(() => recordCost(db, { ...entry, amountMicroAud: 100_000_001 }, NOW)).toThrow(
      /amountMicroAud/,
    );
  });

  it("refuses non-integer, negative or non-finite amounts and units", () => {
    const db = openTestDb();
    for (const bad of [
      { amountMicroAud: 0.5 },
      { amountMicroAud: -1 },
      { amountMicroAud: Number.NaN },
      { units: 1.5 },
      { units: -1 },
    ]) {
      expect(() => recordCost(db, { ...entry, ...bad }, NOW)).toThrow();
    }
    expect(db.select().from(costs).all()).toEqual([]);
  });

  it("refuses a provider that is not a known paid source", () => {
    const db = openTestDb();
    expect(() => recordCost(db, { ...entry, provider: "acme-api" }, NOW)).toThrow(/provider/);
  });

  it("is backed by check constraints in the database", () => {
    const db = openTestDb();
    const insert = (units: number, amount: number) =>
      db.run(
        sql`INSERT INTO costs (created_at, provider, collector, units, amount_micro_aud)
            VALUES (${NOW.getTime()}, 'dataforseo', 'rankings', ${units}, ${amount})`,
      );
    // Drizzle wraps the driver's error; the constraint that failed is in its cause.
    const failure = (units: number, amount: number) => {
      try {
        insert(units, amount);
      } catch (error) {
        return error instanceof Error ? String(error.cause) : String(error);
      }
      return "inserted";
    };
    expect(failure(-1, 0)).toMatch(/CHECK constraint failed: costs_units/);
    expect(failure(1, -1)).toMatch(/CHECK constraint failed: costs_amount/);
    expect(failure(1, 100_000_001)).toMatch(/CHECK constraint failed: costs_amount/);
    expect(failure(0, 0)).toBe("inserted");
  });
});

describe("spentBetween", () => {
  it("sums only the rows inside [start, end)", () => {
    const db = openTestDb();
    const start = new Date("2026-10-01T00:00:00Z");
    const end = new Date("2026-11-01T00:00:00Z");
    recordCost(db, { ...entry, amountMicroAud: 1 }, new Date(start.getTime() - 1));
    recordCost(db, { ...entry, amountMicroAud: 20 }, start);
    recordCost(db, { ...entry, amountMicroAud: 300 }, new Date(end.getTime() - 1));
    recordCost(db, { ...entry, amountMicroAud: 4000 }, end);
    expect(spentBetween(db, start, end)).toBe(320);
  });

  it("is 0 when the ledger has no rows in the window", () => {
    expect(spentBetween(openTestDb(), new Date(0), new Date(1))).toBe(0);
  });
});
