import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import {
  latestDailySlotDay,
  localTime,
  nextDailySlot,
  zonedInstant,
} from "@/lib/format/zoned-time";
import { jobsCreatedSince } from "@/lib/jobs/queue";
import { makeThrottle } from "@/lib/jobs/throttle";
import { enqueueDailyNote } from "./queue";
import { noteMinute, noteStamp } from "./stamp";

const CHECK_MS = 30_000;

/** The schedule runs only for the warm personality, with HARBOUR_SCHEDULED_NOTE on. */
export function noteEnabled(
  config: Pick<Config, "HARBOUR_PERSONALITY" | "HARBOUR_SCHEDULED_NOTE">,
): boolean {
  return config.HARBOUR_PERSONALITY === "warm" && config.HARBOUR_SCHEDULED_NOTE === "on";
}

/** When the schedule next queues the note, or null when it is off. */
export function nextNoteRun(
  now: Date,
  timeZone: string,
  noteTime: string,
  enabled: boolean,
): Date | null {
  return enabled ? nextDailySlot(now, timeZone, noteMinute(noteTime)) : null;
}

export type NoteScheduleDeps = {
  db: Db;
  timeZone: string;
  /** HARBOUR_NOTE_TIME, "HH:MM" local. */
  noteTime: string;
  /** See `noteEnabled`. */
  enabled: boolean;
  /** Without HARBOUR_CLAUDE_OAUTH_TOKEN the run could only fail. */
  tokenSet: boolean;
  clock: () => number;
};

/**
 * The worker's note timetable: one note per local day from HARBOUR_NOTE_TIME, derived from the
 * jobs table so a restart never queues twice and a worker that was down queues exactly one (for
 * the latest slot day, at its first check, which also gives a first install a note). The note is
 * stamped with the minute it is queued, so "Written …" on the card is true for a catch-up. A note the
 * owner asked for since the slot counts; a failed run is not retried in a loop (the owner can ask).
 */
export function makeNoteSchedule(deps: NoteScheduleDeps) {
  const { db, timeZone, noteTime, enabled, tokenSet, clock } = deps;
  const checkDue = makeThrottle(CHECK_MS);
  const minute = noteMinute(noteTime);
  let toldNoToken = false;
  return {
    /** Queues the latest slot day's note if none was created since that slot. Every 30 s and on start. */
    tick(): { jobId: number; stamp: string } | null {
      if (!enabled) return null;
      const nowMs = clock();
      if (!checkDue(nowMs)) return null;
      const now = new Date(nowMs);
      const day = latestDailySlotDay(now, timeZone, minute);
      if (jobsCreatedSince(db, "daily-note", zonedInstant(day, minute, timeZone)).length > 0) {
        return null;
      }
      if (!tokenSet) {
        if (!toldNoToken) console.log("daily note skipped: no Claude token");
        toldNoToken = true;
        return null;
      }
      // The stamp is when the note is written, not the slot: a catch-up at 14:00 says 14:00.
      const stamp = noteStamp(localTime(timeZone, now));
      const job = enqueueDailyNote(db, stamp, null, now);
      return job.created ? { jobId: job.id, stamp } : null;
    },
  };
}
