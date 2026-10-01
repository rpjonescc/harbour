import { openTestDb } from "@/tests/helpers/db";
import { reservationsBetween, spentBetween, unconfirmedBetween } from "./ledger";
import { recordCost, reserveCost } from "./ledger-write";

const start = new Date("2026-10-01T00:00:00Z");
const end = new Date("2026-11-01T00:00:00Z");
const record = (db: ReturnType<typeof openTestDb>, amountMicroAud: number, at: Date) =>
  recordCost(
    db,
    {
      provider: "dataforseo",
      collector: "rankings",
      productId: "acme-docs",
      units: 1,
      amountMicroAud,
      jobId: null,
    },
    at,
  );

describe("spentBetween", () => {
  it("sums only the rows inside [start, end)", () => {
    const db = openTestDb();
    record(db, 1, new Date(start.getTime() - 1));
    record(db, 20, start);
    record(db, 300, new Date(end.getTime() - 1));
    record(db, 4000, end);
    expect(spentBetween(db, start, end)).toBe(320);
  });

  it("counts reserved rows too: a call in flight or cut short by a crash may have been billed", () => {
    const db = openTestDb();
    record(db, 20, start);
    reserveCost(
      db,
      {
        collector: "rankings",
        productId: null,
        jobId: null,
        amountMicroAud: 5,
        capMicroAud: 100,
        window: { start, end },
      },
      start,
    );
    expect(spentBetween(db, start, end)).toBe(25);
    expect(unconfirmedBetween(db, start, end)).toBe(5);
  });

  it("is 0 when the ledger has no rows in the window", () => {
    expect(spentBetween(openTestDb(), new Date(0), new Date(1))).toBe(0);
    expect(unconfirmedBetween(openTestDb(), new Date(0), new Date(1))).toBe(0);
  });
});

describe("reservationsBetween", () => {
  it("lists only reservations inside [start, end), oldest first", () => {
    const db = openTestDb();
    const reserve = (amountMicroAud: number, at: Date, jobId: number | null = null) =>
      reserveCost(
        db,
        {
          collector: "rankings",
          productId: "acme-docs",
          jobId,
          amountMicroAud,
          capMicroAud: 1000,
          window: { start: new Date(0), end },
        },
        at,
      );
    reserve(1, new Date(start.getTime() - 1));
    reserve(2, start);
    record(db, 3, start);
    reserve(4, new Date(end.getTime() - 1));
    expect(reservationsBetween(db, start, end)).toMatchObject([
      { amountMicroAud: 2, collector: "rankings", productId: "acme-docs", createdAt: start },
      { amountMicroAud: 4 },
    ]);
  });
});
