import type { Db } from "@/lib/db/client";
import {
  addDays,
  latestDailySlotDay,
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

/**
 * One digest per local day from HARBOUR_DIGEST_TIME, for the day before, derived from the jobs
 * table so a restart never queues twice. After an outage it queues one digest for the day before
 * the latest slot, only when the worker comes back the same local day, and never backfills earlier
 * days (spec §5.6, §12.1: more days means more raw screen text for little value). A failed run is
 * not retried and a manual digest for the same day counts; the owner can ask again.
 */
export function makeDigestSchedule(deps: DigestScheduleDeps) {
  const due = makeThrottle(CHECK_MS);
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
      return queued.ok && queued.created ? { jobId: queued.id, day } : null;
    },
  };
}
