import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs, workerStatus } from "@/lib/db/schema";
import { claimNextJob, enqueueJob } from "@/lib/jobs/queue";
import { openTestDb } from "@/tests/helpers/db";
import {
  BEAT_EVERY_MS,
  beatEvery,
  markWorkerStarted,
  recordWorkerBeat,
  startWorkerBeat,
  workerLiveness,
} from "./worker-beat";

const t0 = new Date("2026-10-02T09:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
let db: Db;

beforeEach(() => {
  db = openTestDb();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const row = () => db.select().from(workerStatus).get();

describe("recordWorkerBeat and markWorkerStarted", () => {
  it("writes one row: the first beat ever also sets the start time", () => {
    recordWorkerBeat(db, t0);
    expect(row()).toEqual({ id: 1, beatAt: t0, startedAt: t0 });
  });

  it("moves only the beat on later beats, keeping the start time", () => {
    markWorkerStarted(db, t0);
    recordWorkerBeat(db, at(30_000));
    recordWorkerBeat(db, at(60_000));
    expect(db.select().from(workerStatus).all()).toEqual([
      { id: 1, beatAt: at(60_000), startedAt: t0 },
    ]);
  });

  it("sets a new start time when the worker starts again", () => {
    recordWorkerBeat(db, t0);
    markWorkerStarted(db, at(600_000));
    expect(row()).toEqual({ id: 1, beatAt: at(600_000), startedAt: at(600_000) });
  });

  it("allows only the one row", () => {
    expect(() =>
      db.run(sql`insert into worker_status (id, beat_at) values (2, ${t0.getTime()})`),
    ).toThrow();
  });
});

describe("beatEvery", () => {
  it("beats at most once per interval by its own clock", () => {
    let now = t0.getTime();
    const beats: Date[] = [];
    const tick = beatEvery(
      BEAT_EVERY_MS,
      () => now,
      (when) => beats.push(when),
    );
    tick();
    now += 29_999;
    tick();
    now += 1;
    tick();
    expect(beats).toEqual([t0, at(30_000)]);
  });

  it("tries again on the next call after a beat that threw", () => {
    let fail = true;
    const beats: number[] = [];
    const tick = beatEvery(
      BEAT_EVERY_MS,
      () => t0.getTime(),
      () => {
        if (fail) throw new Error("database is locked");
        beats.push(1);
      },
    );
    expect(() => tick()).toThrow("database is locked");
    fail = false;
    tick();
    expect(beats).toEqual([1]);
  });
});

describe("startWorkerBeat", () => {
  it("marks the start, beats on a timer as well as on each call, and stops", () => {
    vi.useFakeTimers({ now: t0 });
    const heartbeat = startWorkerBeat(db);
    expect(row()?.startedAt).toEqual(t0);
    vi.advanceTimersByTime(BEAT_EVERY_MS);
    expect(row()?.beatAt).toEqual(at(BEAT_EVERY_MS));
    heartbeat.beat(); // too soon after the timer's beat: skipped
    expect(row()?.beatAt).toEqual(at(BEAT_EVERY_MS));
    heartbeat.stop();
    vi.advanceTimersByTime(5 * BEAT_EVERY_MS);
    expect(row()?.beatAt).toEqual(at(BEAT_EVERY_MS));
  });

  it("logs a failed beat by its error once and never throws", () => {
    vi.useFakeTimers({ now: t0 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.run(sql`drop table worker_status`);
    const heartbeat = startWorkerBeat(db);
    expect(() => heartbeat.beat()).not.toThrow();
    vi.advanceTimersByTime(3 * BEAT_EVERY_MS);
    heartbeat.stop();
    const lines = warn.mock.calls.map(([line]) => String(line));
    expect(lines.filter((l) => l.startsWith("worker start failed"))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith("worker beat failed"))).toHaveLength(1);
    expect(lines[1]).toMatch(/SqliteError: no such table: worker_status/);
  });
});

describe("workerLiveness", () => {
  it("is a gap when the worker has never beaten and nothing runs", () => {
    expect(workerLiveness(db, t0)).toEqual({ lastSeen: null, startedAt: null, runningJob: false });
  });

  it("reads the beat and the start time", () => {
    markWorkerStarted(db, at(-3_600_000));
    recordWorkerBeat(db, at(-90_000));
    expect(workerLiveness(db, t0)).toEqual({
      lastSeen: at(-90_000),
      startedAt: at(-3_600_000),
      runningJob: false,
    });
  });

  it("counts a running job's fresher heartbeat as the worker being seen", () => {
    recordWorkerBeat(db, at(-11 * 60_000));
    const { id } = enqueueJob(db, "research", { topic: "glossary" }, null, at(-20 * 60_000));
    claimNextJob(db, at(-15 * 60_000));
    db.update(jobs)
      .set({ heartbeatAt: at(-20_000) })
      .where(eq(jobs.id, id))
      .run();
    expect(workerLiveness(db, t0)).toMatchObject({ lastSeen: at(-20_000), runningJob: true });
  });

  it("keeps the newer beat when a running job's heartbeat is older", () => {
    enqueueJob(db, "research", { topic: "glossary" }, null, at(-20 * 60_000));
    claimNextJob(db, at(-15 * 60_000)); // no heartbeat: its start time stands in
    recordWorkerBeat(db, at(-60_000));
    expect(workerLiveness(db, t0)).toMatchObject({ lastSeen: at(-60_000), runningJob: true });
  });

  it("never reads a beat from the future as fresher than now", () => {
    recordWorkerBeat(db, at(5 * 60_000));
    expect(workerLiveness(db, t0).lastSeen).toEqual(t0);
  });
});
