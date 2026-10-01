import { finishScan, startScan } from "@/lib/scan/store";
import { openTestDb } from "@/tests/helpers/db";
import { claimNextJob, enqueueJob, finishJob, listJobs } from "./queue";
import { localTime, makeScanSchedule, nextDailyScan } from "./scan-schedule";

const HOUR = 60 * 60_000;
const PRODUCTS = ["acme-docs", "acme-blog"];

function harness(timeZone: string, db = openTestDb(), enabled = true) {
  let now = 0;
  const schedule = makeScanSchedule({
    db,
    timeZone,
    enabled,
    clock: () => now,
    productIds: () => PRODUCTS,
  });
  const scans = () =>
    listJobs(db, 100)
      .filter((j) => j.kind === "scan")
      .map((j) => j.params.productId)
      .sort();
  /** Runs every queued job to completion, so enqueue dedupe no longer hides a new one. */
  const settleAll = () => {
    for (let job = claimNextJob(db); job; job = claimNextJob(db)) {
      finishJob(db, job.id, "ok", null);
    }
  };
  return {
    db,
    schedule,
    scans,
    settleAll,
    at: (iso: string) => {
      now = Date.parse(iso);
      return schedule.tick();
    },
    setNow: (iso: string) => {
      now = Date.parse(iso);
    },
  };
}

/** A finished scan of `productId` that ended at `finishedAt`. */
function scanEnded(
  db: ReturnType<typeof openTestDb>,
  productId: string,
  status: "ok" | "partial" | "failed",
  finishedAt: string,
) {
  const job = enqueueJob(db, "scan", { productId }, null, new Date(Date.parse(finishedAt) - HOUR));
  const claimed = claimNextJob(db);
  if (!claimed || claimed.id !== job.id) throw new Error("expected the scan job to be next");
  const scanId = startScan(db, productId, job.id, new Date(Date.parse(finishedAt) - HOUR));
  finishScan(db, scanId, status, new Date(finishedAt));
  finishJob(db, job.id, "ok", null);
}

describe("localTime", () => {
  it("reads the local day and minute of the day in the zone", () => {
    expect(localTime("Australia/Brisbane", new Date("2026-10-03T20:00:00Z"))).toEqual({
      day: "2026-10-04",
      minute: 6 * 60,
    });
    // Midnight is minute 0, never 24:00.
    expect(localTime("Australia/Brisbane", new Date("2026-10-03T14:00:00Z")).minute).toBe(0);
  });

  it("follows Sydney's clock change to daylight time", () => {
    // 4 October 2026: Sydney moves from UTC+10 to UTC+11 at 02:00 local.
    expect(localTime("Australia/Sydney", new Date("2026-10-02T20:00:00Z"))).toEqual({
      day: "2026-10-03",
      minute: 6 * 60,
    });
    expect(localTime("Australia/Sydney", new Date("2026-10-03T19:00:00Z"))).toEqual({
      day: "2026-10-04",
      minute: 6 * 60,
    });
  });
});

describe("daily scan", () => {
  it("queues one scan per product at 06:00 local, once a day (Brisbane, no DST)", () => {
    const h = harness("Australia/Brisbane");
    expect(h.at("2026-10-01T19:59:00Z")).toEqual([]); // 05:59
    expect(h.at("2026-10-01T20:00:00Z").map((s) => s.productId)).toEqual(PRODUCTS);
    expect(h.scans()).toEqual(["acme-blog", "acme-docs"]);
    h.settleAll();
    expect(h.at("2026-10-01T23:00:00Z")).toEqual([]); // 09:00, already done today
    expect(h.at("2026-10-02T13:59:00Z")).toEqual([]); // 23:59
    expect(h.at("2026-10-02T19:59:00Z")).toEqual([]); // 05:59 next day
    expect(h.at("2026-10-02T20:00:00Z")).toHaveLength(2);
    expect(h.scans()).toHaveLength(4);
  });

  it("keeps 06:00 local across Sydney's change to daylight time", () => {
    const h = harness("Australia/Sydney");
    expect(h.at("2026-10-02T19:59:00Z")).toEqual([]); // 05:59 AEST, 3 Oct
    expect(h.at("2026-10-02T20:00:00Z")).toHaveLength(2); // 06:00 AEST
    h.settleAll();
    expect(h.at("2026-10-03T18:59:00Z")).toEqual([]); // 05:59 AEDT, 4 Oct
    expect(h.at("2026-10-03T19:00:00Z")).toHaveLength(2); // 06:00 AEDT
    h.settleAll();
    expect(h.at("2026-10-03T20:00:00Z")).toEqual([]); // 07:00 AEDT: a fixed offset would fire here
  });

  it("keeps 06:00 local across Sydney's change back to standard time", () => {
    // 5 April 2026: Sydney moves from UTC+11 to UTC+10 at 03:00 local.
    const h = harness("Australia/Sydney");
    expect(h.at("2026-04-03T19:00:00Z")).toHaveLength(2); // 06:00 AEDT, 4 Apr
    h.settleAll();
    expect(h.at("2026-04-04T19:00:00Z")).toEqual([]); // 05:00 AEST, 5 Apr
    expect(h.at("2026-04-04T19:59:00Z")).toEqual([]);
    expect(h.at("2026-04-04T20:00:00Z")).toHaveLength(2); // 06:00 AEST
  });

  it("never queues a second scan while one for the product is queued or running", () => {
    const h = harness("Australia/Brisbane");
    enqueueJob(h.db, "scan", { productId: "acme-docs" }, null, new Date("2026-10-01T10:00:00Z"));
    expect(h.at("2026-10-01T20:00:00Z")).toEqual([
      { productId: "acme-blog", jobId: expect.any(Number) },
    ]);
    expect(h.scans()).toEqual(["acme-blog", "acme-docs"]);
  });

  it("does not queue again after a restart on the same day", () => {
    const db = openTestDb();
    const first = harness("Australia/Brisbane", db);
    expect(first.at("2026-10-01T20:00:00Z")).toHaveLength(2);
    first.settleAll();
    const restarted = harness("Australia/Brisbane", db);
    expect(restarted.at("2026-10-01T21:00:00Z")).toEqual([]);
    expect(restarted.scans()).toHaveLength(2);
  });

  it("still runs today's scan when the worker was down at 06:00", () => {
    const h = harness("Australia/Brisbane");
    expect(h.at("2026-10-02T02:00:00Z")).toHaveLength(2); // 12:00, first tick of the day
  });

  it("counts a scan queued by hand after 06:00 as today's", () => {
    const h = harness("Australia/Brisbane");
    enqueueJob(h.db, "scan", { productId: "acme-docs" }, null, new Date("2026-10-01T20:30:00Z"));
    h.settleAll();
    expect(h.at("2026-10-01T21:00:00Z").map((s) => s.productId)).toEqual(["acme-blog"]);
  });

  it("checks at most every 30 seconds", () => {
    const h = harness("Australia/Brisbane");
    expect(h.at("2026-10-01T19:59:50Z")).toEqual([]);
    expect(h.at("2026-10-01T20:00:10Z")).toEqual([]); // 20 s later: not checked
    expect(h.at("2026-10-01T20:00:20Z")).toHaveLength(2);
  });

  it("checks again at once when the clock steps backwards", () => {
    const h = harness("Australia/Brisbane");
    expect(h.at("2026-10-02T19:00:00Z")).toEqual([]); // 05:00, 3 Oct
    // The clock is corrected back a day: 06:00, 2 Oct is checked, not throttled.
    expect(h.at("2026-10-01T20:00:00Z")).toHaveLength(2);
  });
});

describe("scheduled scans turned off", () => {
  it("queues neither the daily scan nor a catch-up", () => {
    const h = harness("Australia/Brisbane", openTestDb(), false);
    h.setNow("2026-10-02T02:00:00Z");
    expect(h.schedule.catchUp()).toEqual([]);
    expect(h.at("2026-10-02T02:00:00Z")).toEqual([]);
    expect(h.scans()).toEqual([]);
  });
});

describe("catch-up on start", () => {
  it("queues products without an ok or partial scan in the last 24 hours", () => {
    const h = harness("Australia/Brisbane");
    const PRODUCT_IDS = ["fresh-ok", "fresh-partial", "stale", "failed", "never"];
    const schedule = makeScanSchedule({
      db: h.db,
      timeZone: "Australia/Brisbane",
      enabled: true,
      clock: () => Date.parse("2026-10-02T02:00:00Z"),
      productIds: () => PRODUCT_IDS,
    });
    scanEnded(h.db, "fresh-ok", "ok", "2026-10-01T03:00:00Z"); // 23 h ago
    scanEnded(h.db, "fresh-partial", "partial", "2026-10-01T03:00:00Z");
    scanEnded(h.db, "stale", "ok", "2026-10-01T01:00:00Z"); // 25 h ago
    scanEnded(h.db, "failed", "ok", "2026-09-30T20:00:00Z");
    scanEnded(h.db, "failed", "failed", "2026-10-02T01:00:00Z"); // recent, but failed
    expect(schedule.catchUp().map((s) => s.productId)).toEqual(["stale", "failed", "never"]);
  });

  it("does not queue a duplicate when a scan is already queued", () => {
    const h = harness("Australia/Brisbane");
    h.setNow("2026-10-02T02:00:00Z");
    enqueueJob(h.db, "scan", { productId: "acme-docs" }, null);
    expect(h.schedule.catchUp().map((s) => s.productId)).toEqual(["acme-blog"]);
    expect(h.scans()).toEqual(["acme-blog", "acme-docs"]);
  });
});

describe("nextDailyScan", () => {
  const zone = "Europe/London";
  // 2026-10-01 is in British Summer Time: 06:00 local is 05:00 UTC.
  const local = (time: string) => new Date(`2026-10-01T${time}+01:00`);

  it("is off when scheduled scans are off", () => {
    expect(nextDailyScan(local("12:00"), zone, false, null)).toBe("off");
  });

  it("is today before 06:00 local", () => {
    expect(nextDailyScan(local("05:59"), zone, true, local("05:30"))).toBe("today");
  });

  it("is tomorrow once a scan job was created since today's 06:00", () => {
    expect(nextDailyScan(local("12:00"), zone, true, local("06:00"))).toBe("tomorrow");
  });

  it("is due after 06:00 until today's scan job exists", () => {
    expect(nextDailyScan(local("12:00"), zone, true, null)).toBe("due");
    expect(nextDailyScan(local("12:00"), zone, true, local("05:59"))).toBe("due");
  });
});
