import { claimNextJob, enqueueJob, finishJob, listJobs } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import { enqueueDailyNote, MAX_ON_DEMAND_PER_DAY, requestFreshNote } from "./queue";

const ZONE = "Europe/London";
const BASE = Date.parse("2026-10-02T05:30:00Z"); // 06:30 in London
const ask = (db: ReturnType<typeof openTestDb>, at: number) =>
  requestFreshNote(db, { timeZone: ZONE, login: "owner@example.com", now: new Date(at) });
const settle = (db: ReturnType<typeof openTestDb>) => {
  const job = claimNextJob(db);
  if (job) finishJob(db, job.id, "ok", null);
};

describe("enqueueDailyNote", () => {
  it("queues one job per stamp, deduped while it is queued or running", () => {
    const db = openTestDb();
    const first = enqueueDailyNote(db, "2026-10-02-0630", null);
    expect(first.created).toBe(true);
    expect(enqueueDailyNote(db, "2026-10-02-0630", null)).toEqual({ id: first.id, created: false });
    expect(listJobs(db)[0]).toMatchObject({
      kind: "daily-note",
      params: { stamp: "2026-10-02-0630" },
    });
  });

  it("refuses a stamp that is not one", () => {
    expect(() => enqueueDailyNote(openTestDb(), "../x", null)).toThrow(/Invalid note stamp/);
  });
});

describe("requestFreshNote", () => {
  it("stamps the job with the owner's local time", () => {
    const db = openTestDb();
    const result = ask(db, BASE);
    expect(result).toMatchObject({ ok: true, created: true });
    expect(listJobs(db)[0]).toMatchObject({
      params: { stamp: "2026-10-02-0630" },
      requestedBy: "owner@example.com",
    });
  });

  it("allows one run at a time: a second request returns the one already waiting", () => {
    const db = openTestDb();
    const first = ask(db, BASE);
    const second = ask(db, BASE + 60_000);
    expect(second).toEqual({ ok: true, jobId: first.ok ? first.jobId : -1, created: false });
    expect(listJobs(db)).toHaveLength(1);
  });

  it(`allows ${MAX_ON_DEMAND_PER_DAY} requests a local day, then says no`, () => {
    const db = openTestDb();
    for (let i = 0; i < MAX_ON_DEMAND_PER_DAY; i++) {
      expect(ask(db, BASE + i * 120_000)).toMatchObject({ ok: true, created: true });
      settle(db);
    }
    expect(ask(db, BASE + 20 * 60_000)).toEqual({ ok: false, reason: "rate_limited" });
    expect(listJobs(db)).toHaveLength(MAX_ON_DEMAND_PER_DAY);
  });

  it("counts only the owner's requests, not the scheduled note, and starts afresh the next day", () => {
    const db = openTestDb();
    enqueueJob(db, "daily-note", { stamp: "2026-10-02-0630" }, null, new Date(BASE));
    settle(db);
    for (let i = 0; i < MAX_ON_DEMAND_PER_DAY; i++) {
      expect(ask(db, BASE + (i + 1) * 120_000)).toMatchObject({ ok: true });
      settle(db);
    }
    expect(ask(db, BASE + 30 * 60_000)).toMatchObject({ ok: false });
    expect(ask(db, BASE + 24 * 60 * 60_000)).toMatchObject({ ok: true, created: true });
  });

  it("counts the local day, not the UTC day (Brisbane is already tomorrow)", () => {
    const db = openTestDb();
    const at = Date.parse("2026-10-02T14:30:00Z"); // 00:30 on 3 October in Brisbane
    expect(
      requestFreshNote(db, {
        timeZone: "Australia/Brisbane",
        login: "owner@example.com",
        now: new Date(at),
      }),
    ).toMatchObject({ ok: true });
    expect(listJobs(db)[0]?.params.stamp).toBe("2026-10-03-0030");
  });
});
