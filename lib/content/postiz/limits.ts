import { and, count, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";

/** Harbour's own cap on Postiz requests (Postiz allows more); each send makes two. */
export const POSTIZ_REQUESTS_PER_HOUR = 10;
export const REQUESTS_PER_SEND = 2;
export const SENDS_PER_HOUR = POSTIZ_REQUESTS_PER_HOUR / REQUESTS_PER_SEND;

const HOUR_MS = 60 * 60 * 1000;

/** The result a send finishes with when it stopped before asking Postiz anything. */
export const NOT_ASKED = "postiz-not-asked";

/**
 * Sends that started in the hour before `now`. One that stopped before asking Postiz anything does
 * not count; one cut off by a restart does (it may have asked).
 */
export function sendsInLastHour(db: Db, now: Date, exceptJobId?: number): number {
  const row = db
    .select({ n: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.kind, "content-postiz"),
        gte(jobs.startedAt, new Date(now.getTime() - HOUR_MS)),
        or(isNull(jobs.result), ne(jobs.result, NOT_ASKED)),
        exceptJobId === undefined ? undefined : ne(jobs.id, exceptJobId),
      ),
    )
    .get();
  return row?.n ?? 0;
}

/** Sends waiting or under way: Harbour sends one piece at a time. */
export function sendsWaiting(db: Pick<Db, "select">): number {
  const row = db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.kind, "content-postiz"), inArray(jobs.status, ["queued", "running"])))
    .get();
  return row?.n ?? 0;
}
