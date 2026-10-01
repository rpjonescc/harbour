import { sql } from "drizzle-orm";
import { costs } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import {
  type CostEntry,
  dropReservations,
  recordCost,
  reserveCost,
  settleCost,
} from "./ledger-write";

const NOW = new Date("2026-10-15T12:00:00Z");
const LATER = new Date("2026-10-15T12:00:05Z");
const OCTOBER = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-11-01T00:00:00Z") };
const entry: CostEntry = {
  provider: "dataforseo",
  collector: "rankings",
  productId: "acme-docs",
  units: 1,
  amountMicroAud: 900,
  jobId: null,
};
const who = { collector: "rankings", productId: "acme-docs", jobId: null };

describe("recordCost", () => {
  it("stores one recorded row per paid call", () => {
    const db = openTestDb();
    const job = enqueueJob(db, "scan", { productId: "acme-docs" }, null, NOW);
    recordCost(db, { ...entry, jobId: job.id }, NOW);
    expect(db.select().from(costs).all()).toEqual([
      { id: 1, createdAt: NOW, status: "recorded", ...entry, jobId: job.id },
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
    const insert = (status: string, provider: string | null, units: number, amount: number) =>
      db.run(
        sql`INSERT INTO costs (created_at, status, provider, collector, units, amount_micro_aud)
            VALUES (${NOW.getTime()}, ${status}, ${provider}, 'rankings', ${units}, ${amount})`,
      );
    // Drizzle wraps the driver's error; the constraint that failed is in its cause.
    const failure = (...args: Parameters<typeof insert>) => {
      try {
        insert(...args);
      } catch (error) {
        return error instanceof Error ? String(error.cause) : String(error);
      }
      return "inserted";
    };
    expect(failure("recorded", "dataforseo", -1, 0)).toMatch(/costs_units/);
    expect(failure("recorded", "dataforseo", 1, -1)).toMatch(/costs_amount/);
    expect(failure("recorded", "dataforseo", 1, 100_000_001)).toMatch(/costs_amount/);
    expect(failure("pending", "dataforseo", 1, 1)).toMatch(/costs_status/);
    expect(failure("recorded", null, 1, 1)).toMatch(/costs_provider/);
    expect(failure("reserved", null, 0, 1)).toBe("inserted");
    expect(failure("recorded", "dataforseo", 0, 0)).toBe("inserted");
  });
});

describe("reserveCost", () => {
  it("reserves the estimate when it fits this window's spend, reserved rows included", () => {
    const db = openTestDb();
    recordCost(db, { ...entry, amountMicroAud: 600 }, NOW);
    const id = reserveCost(
      db,
      { ...who, amountMicroAud: 300, capMicroAud: 1000, window: OCTOBER },
      NOW,
    );
    expect(id).toEqual(expect.any(Number));
    expect(
      reserveCost(db, { ...who, amountMicroAud: 101, capMicroAud: 1000, window: OCTOBER }, NOW),
    ).toBeNull();
    expect(
      reserveCost(db, { ...who, amountMicroAud: 100, capMicroAud: 1000, window: OCTOBER }, NOW),
    ).toEqual(expect.any(Number));
    const reserved = db
      .select()
      .from(costs)
      .all()
      .filter((r) => r.status === "reserved");
    expect(reserved).toHaveLength(2);
    expect(reserved[0]).toMatchObject({ provider: null, units: 0, amountMicroAud: 300 });
  });

  it("never reserves without a budget", () => {
    const db = openTestDb();
    expect(
      reserveCost(db, { ...who, amountMicroAud: 1, capMicroAud: 0, window: OCTOBER }, NOW),
    ).toBeNull();
  });
});

describe("settleCost", () => {
  it("turns a reservation into the recorded call at its actual price and time", () => {
    const db = openTestDb();
    const id = reserveCost(
      db,
      { ...who, amountMicroAud: 300, capMicroAud: 1000, window: OCTOBER },
      NOW,
    );
    if (id === null) throw new Error("expected a reservation");
    expect(
      settleCost(db, id, { provider: "dataforseo", units: 2, amountMicroAud: 250 }, LATER),
    ).toBe(true);
    expect(db.select().from(costs).all()).toEqual([
      {
        id,
        createdAt: LATER,
        status: "recorded",
        ...who,
        provider: "dataforseo",
        units: 2,
        amountMicroAud: 250,
      },
    ]);
    // Settled once only.
    expect(settleCost(db, id, { provider: "dataforseo", units: 1, amountMicroAud: 1 }, LATER)).toBe(
      false,
    );
  });

  it("validates the actual cost like recordCost, leaving the reservation in place", () => {
    const db = openTestDb();
    const id = reserveCost(
      db,
      { ...who, amountMicroAud: 300, capMicroAud: 1000, window: OCTOBER },
      NOW,
    );
    if (id === null) throw new Error("expected a reservation");
    expect(() =>
      settleCost(db, id, { provider: "acme-api", units: 1, amountMicroAud: 1 }, LATER),
    ).toThrow(/provider/);
    expect(db.select().from(costs).all()[0]?.status).toBe("reserved");
  });
});

describe("dropReservations", () => {
  it("deletes only the given rows that are still reserved", () => {
    const db = openTestDb();
    const reserve = () =>
      reserveCost(db, { ...who, amountMicroAud: 1, capMicroAud: 1000, window: OCTOBER }, NOW) ?? 0;
    const [a, b] = [reserve(), reserve()];
    settleCost(db, a, { provider: "dataforseo", units: 1, amountMicroAud: 1 }, NOW);
    dropReservations(db, [a, b]);
    expect(
      db
        .select()
        .from(costs)
        .all()
        .map((r) => [r.id, r.status]),
    ).toEqual([[a, "recorded"]]);
  });
});
