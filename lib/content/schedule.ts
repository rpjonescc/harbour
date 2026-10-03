import type { Db } from "@/lib/db/client";
import { addDays } from "@/lib/format/iso-day";
import {
  latestDailySlotDay,
  localMoment,
  localTime,
  nextDailySlot,
  zonedInstant,
} from "@/lib/format/zoned-time";
import { jobsCreatedSince } from "@/lib/jobs/queue";
import { makeThrottle } from "@/lib/jobs/throttle";
import { noteMinute } from "@/lib/note/stamp";
import { enqueueContent } from "./limits";

const CHECK_MS = 30_000;

/** When the digest schedule next queues a run, or null when it is off. */
export function nextDigestRun(
  now: Date,
  timeZone: string,
  time: string,
  enabled: boolean,
): Date | null {
  return enabled ? nextDailySlot(now, timeZone, noteMinute(time)) : null;
}

export type DigestScheduleDeps = {
  db: Db;
  timeZone: string;
  /** HARBOUR_DIGEST_TIME, "HH:MM" local. */
  digestTime: string;
  /** HARBOUR_CONTENT on and HARBOUR_SCHEDULED_DIGEST on. */
  enabled: boolean;
  tokenSet: boolean;
  keySet: boolean;
  dailyRuns: number;
  clock: () => number;
};

/** Says once per slot (not on every tick) that a scheduled run was refused, and why. */
function makeWarner() {
  const warned = new Set<string>();
  return (key: string, what: string, reason: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    const why =
      reason === "daily_cap" ? "the daily content run limit is reached" : "it was refused";
    console.warn(`content: ${what} was not queued: ${why}`);
  };
}

/**
 * One digest per local day from HARBOUR_DIGEST_TIME, for the day before, derived from the jobs
 * table so a restart never queues twice. After an outage it queues one digest for the day before
 * the latest slot, only when the worker comes back the same local day, and never backfills earlier
 * days (spec §5.6, §12.1: more days means more raw screen text for little value). A failed run is
 * not retried and a manual digest for the same day counts; the owner can ask again.
 */
export function makeDigestSchedule(deps: DigestScheduleDeps) {
  const due = makeThrottle(CHECK_MS);
  const warnOnce = makeWarner();
  const minute = noteMinute(deps.digestTime);
  return {
    tick(): { jobId: number; day: string } | null {
      if (!deps.enabled || !deps.tokenSet || !deps.keySet) return null;
      const nowMs = deps.clock();
      if (!due(nowMs)) return null;
      const now = new Date(nowMs);
      const slotDay = latestDailySlotDay(now, deps.timeZone, minute);
      // Catch-up is for a worker that was down at the slot and starts later the same day. A start
      // before today's slot, or after a longer outage, queues nothing for an earlier day.
      if (localTime(deps.timeZone, now).day !== slotDay) return null;
      const day = addDays(slotDay, -1);
      // Any digest for that day, scheduled, manual or failed, settles it (no retry, no second one).
      const since = zonedInstant(day, 0, deps.timeZone);
      if (jobsCreatedSince(deps.db, "content-digest", since).some((j) => j.params.day === day)) {
        return null;
      }
      const queued = enqueueContent(deps.db, {
        kind: "content-digest",
        params: { day },
        requestedBy: null,
        timeZone: deps.timeZone,
        now,
        dailyRuns: deps.dailyRuns,
      });
      if (!queued.ok) warnOnce(`digest:${day}`, `the scheduled digest for ${day}`, queued.reason);
      return queued.ok && queued.created ? { jobId: queued.id, day } : null;
    },
  };
}

const IDEAS_MINUTE = 7 * 60; // Monday 07:00, after the 05:45 digest
const MONDAY_FIRST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The Monday of the local week that `now` falls in, and whether its 07:00 slot has passed. */
function thisWeeksSlot(now: Date, timeZone: string): { monday: string; passed: boolean } {
  const local = localMoment(timeZone, now);
  const sinceMonday = MONDAY_FIRST.indexOf(local.weekday);
  return {
    monday: addDays(local.day, -sinceMonday),
    passed: sinceMonday > 0 || local.hour * 60 + local.minute >= IDEAS_MINUTE,
  };
}

/** The Monday whose 07:00 slot is the latest at or before `now`. */
export function latestIdeasSlotDay(now: Date, timeZone: string): string {
  const { monday, passed } = thisWeeksSlot(now, timeZone);
  return passed ? monday : addDays(monday, -7);
}

/** The next Monday 07:00, or null when the schedule is off. */
export function nextIdeasRun(now: Date, timeZone: string, enabled: boolean): Date | null {
  return enabled
    ? zonedInstant(addDays(latestIdeasSlotDay(now, timeZone), 7), IDEAS_MINUTE, timeZone)
    : null;
}

export type IdeasScheduleDeps = {
  db: Db;
  timeZone: string;
  /** HARBOUR_CONTENT on and HARBOUR_SCHEDULED_IDEAS on. */
  enabled: boolean;
  tokenSet: boolean;
  dailyRuns: number;
  clock: () => number;
  /** Ids of every content product. */
  productIds: () => string[];
  /** A valid voice profile and fewer than 12 ideas waiting; reads the brain, so called last. */
  isReady: (productId: string) => boolean;
};

/**
 * Monday's idea runs: one per ready product per Monday, derived from the jobs table so a restart
 * never queues twice. After an outage it catches up once, for this week's Monday only (never an
 * earlier week: a worker that was down for a fortnight does not write two weeks of ideas). A
 * manual run since that slot, or a failed one, settles the product for the week.
 */
export function makeIdeasSchedule(deps: IdeasScheduleDeps) {
  const due = makeThrottle(CHECK_MS);
  const warnOnce = makeWarner();
  return {
    tick(): { jobId: number; productId: string }[] {
      if (!deps.enabled || !deps.tokenSet || !due(deps.clock())) return [];
      const now = new Date(deps.clock());
      const since = zonedInstant(
        latestIdeasSlotDay(now, deps.timeZone),
        IDEAS_MINUTE,
        deps.timeZone,
      );
      if (!thisWeeksSlot(now, deps.timeZone).passed) return [];
      const done = new Set(
        jobsCreatedSince(deps.db, "content-ideas", since).map((j) => j.params.productId),
      );
      // Products with this week's run already queued are settled: the brain is not read for them.
      const queued: { jobId: number; productId: string }[] = [];
      for (const productId of deps.productIds().filter((id) => !done.has(id))) {
        if (!deps.isReady(productId)) continue;
        const result = enqueueContent(deps.db, {
          kind: "content-ideas",
          params: { productId },
          requestedBy: null,
          timeZone: deps.timeZone,
          now,
          dailyRuns: deps.dailyRuns,
        });
        if (!result.ok) {
          const slot = latestIdeasSlotDay(now, deps.timeZone);
          warnOnce(
            `ideas:${slot}:${productId}`,
            `the scheduled ideas run for ${productId}`,
            result.reason,
          );
        }
        if (result.ok && result.created) queued.push({ jobId: result.id, productId });
      }
      return queued;
    },
  };
}
