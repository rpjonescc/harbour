import type { Db } from "@/lib/db/client";
import { lastGoodScanAt } from "@/lib/scan/store";
import { enqueueJob, jobsCreatedSince } from "./queue";
import { makeThrottle } from "./throttle";

/** The daily scan is due from 06:00 local time. */
const DAILY_MINUTE = 6 * 60;
const CHECK_MS = 30_000;
const DAY_MS = 24 * 60 * 60_000;
/** How far back a job can be and still fall on today's local date (a day is at most 25 h). */
const LOOKBACK_MS = 2 * DAY_MS;

export type LocalTime = { day: string; minute: number };
export type QueuedScan = { productId: string; jobId: number };

/** The local date (YYYY-MM-DD) and minute of the day of `at` in `timeZone`, DST-aware. */
export function localTime(timeZone: string, at: Date): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/** True when `at` is on the same local day as `today`, at or after 06:00. */
function inDailySlot(timeZone: string, at: Date, today: LocalTime): boolean {
  const local = localTime(timeZone, at);
  return local.day === today.day && local.minute >= DAILY_MINUTE;
}

export type NextDailyScan = "off" | "today" | "tomorrow" | "due";

/**
 * When the product's next daily scan is queued: "today" before 06:00 local, "tomorrow" once a
 * scan job was created since today's 06:00 (by the schedule or by hand, as `tick` counts it),
 * "due" until then (the worker queues it at its next check), or "off".
 */
export function nextDailyScan(
  now: Date,
  timeZone: string,
  enabled: boolean,
  lastJobCreatedAt: Date | null,
): NextDailyScan {
  if (!enabled) return "off";
  const today = localTime(timeZone, now);
  if (today.minute < DAILY_MINUTE) return "today";
  if (lastJobCreatedAt && inDailySlot(timeZone, lastJobCreatedAt, today)) return "tomorrow";
  return "due";
}

/** Queues a scan of a product unless one is already queued or running. */
export function enqueueScan(
  db: Db,
  productId: string,
  requestedBy: string | null,
  now = new Date(),
): { id: number; created: boolean } {
  return enqueueJob(db, "scan", { productId }, requestedBy, now);
}

export type ScanScheduleDeps = {
  db: Db;
  timeZone: string;
  /** False when HARBOUR_SCHEDULED_SCANS is off: nothing is queued automatically. */
  enabled: boolean;
  clock: () => number;
  productIds: () => readonly string[];
};

/**
 * The worker's scan timetable: a scan per product every day from 06:00 local time, and a
 * catch-up on start for products without a good scan in the last 24 hours. Scans never touch
 * the brain, so unlike agent runs they never wait for it to be quiet.
 */
export function makeScanSchedule(deps: ScanScheduleDeps) {
  const { db, timeZone, enabled, clock, productIds } = deps;
  const checkDue = makeThrottle(CHECK_MS);

  const queue = (ids: readonly string[], now: Date): QueuedScan[] =>
    ids.flatMap((productId) => {
      const job = enqueueScan(db, productId, null, now);
      return job.created ? [{ productId, jobId: job.id }] : [];
    });

  return {
    /** Queues a scan for every product whose last ok or partial scan is over 24 hours old. */
    catchUp(): QueuedScan[] {
      if (!enabled) return [];
      const now = new Date(clock());
      const stale = productIds().filter((id) => {
        const at = lastGoodScanAt(db, id);
        return at === null || now.getTime() - at.getTime() > DAY_MS;
      });
      return queue(stale, now);
    },
    /**
     * From 06:00 local, queues today's scan for each product that has no scan job created
     * since then. Derived from the jobs table, so a restart never queues it twice and a worker
     * that was down at 06:00 still queues it on its first check of the day.
     */
    tick(): QueuedScan[] {
      if (!enabled) return [];
      const nowMs = clock();
      if (!checkDue(nowMs)) return [];
      const now = new Date(nowMs);
      const today = localTime(timeZone, now);
      if (today.minute < DAILY_MINUTE) return [];
      const done = new Set(
        jobsCreatedSince(db, "scan", new Date(nowMs - LOOKBACK_MS))
          .filter((job) => inDailySlot(timeZone, job.createdAt, today))
          .map((job) => job.params.productId),
      );
      return queue(
        productIds().filter((id) => !done.has(id)),
        now,
      );
    },
  };
}
