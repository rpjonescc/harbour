import { and, gte, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { localTime, zonedInstant } from "@/lib/format/zoned-time";
import { CONTENT_AGENT_KINDS } from "@/lib/jobs/job-kinds";
import { enqueueJobIn, findActiveJob, type JobWriter } from "@/lib/jobs/queue";

export const DAILY_CAP_MESSAGE =
  "Harbour has done its content work for today. It starts again tomorrow.";
/** The owner's own requests per local day: digests, idea runs per product, and any step per idea. */
export const MANUAL_LIMITS = { digest: 2, ideasPerProduct: 3, perIdea: 4 } as const;

export type ContentKind = (typeof CONTENT_AGENT_KINDS)[number];
export type EnqueueResult =
  | { ok: true; id: number; created: boolean }
  | { ok: false; reason: "daily_cap" | "rate_limited" };

export type EnqueueInput = {
  kind: ContentKind;
  params: Record<string, string>;
  /** The owner's login, or null for the schedule and for chained steps. */
  requestedBy: string | null;
  timeZone: string;
  now: Date;
  dailyRuns: number;
  /** A step of a chain under way: it may finish past the daily cap (at most 8 runs per idea). */
  chained?: boolean;
};

const startOfDay = (timeZone: string, now: Date) =>
  zonedInstant(localTime(timeZone, now).day, 0, timeZone);

function today(db: JobWriter, since: Date) {
  return db
    .select()
    .from(jobs)
    .where(and(inArray(jobs.kind, [...CONTENT_AGENT_KINDS]), gte(jobs.createdAt, since)))
    .all();
}

/** Content agent runs created since local midnight, scheduled and manual together. */
export function contentRunsToday(db: JobWriter, timeZone: string, now: Date): number {
  return today(db, startOfDay(timeZone, now)).length;
}

function manualLimitHit(db: JobWriter, input: EnqueueInput): boolean {
  if (input.requestedBy === null) return false;
  const { kind, params } = input;
  const mine = today(db, startOfDay(input.timeZone, input.now)).filter(
    (job) => job.requestedBy !== null,
  );
  if (kind === "content-digest") {
    return mine.filter((j) => j.kind === kind).length >= MANUAL_LIMITS.digest;
  }
  if (kind === "content-ideas") {
    const same = mine.filter((j) => j.kind === kind && j.params.productId === params.productId);
    return same.length >= MANUAL_LIMITS.ideasPerProduct;
  }
  // The other steps belong to one idea: a request without one would match every job without one.
  if (params.ideaId === undefined) throw new Error(`${kind} needs an ideaId`);
  return mine.filter((j) => j.params.ideaId === params.ideaId).length >= MANUAL_LIMITS.perIdea;
}

/**
 * Queues a content job unless the daily cap or the owner's own rate limit says no. A job already
 * queued or running for the same request is returned first, so a double click at a limit is not
 * an error; the check and the insert share one transaction, so two requests cannot both pass.
 */
export function enqueueContent(db: Db, input: EnqueueInput): EnqueueResult {
  // Types are erased at the HTTP and worker boundaries: an unknown kind must not fall through.
  if (!(CONTENT_AGENT_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`${input.kind} is not a content agent kind`);
  }
  return db.transaction(
    (tx): EnqueueResult => {
      const existing = findActiveJob(tx, input.kind, input.params);
      if (existing !== null) return { ok: true, id: existing, created: false };
      if (!input.chained) {
        if (contentRunsToday(tx, input.timeZone, input.now) >= input.dailyRuns) {
          return { ok: false, reason: "daily_cap" };
        }
        if (manualLimitHit(tx, input)) return { ok: false, reason: "rate_limited" };
      }
      const job = enqueueJobIn(tx, input.kind, input.params, input.requestedBy, input.now);
      return { ok: true, ...job };
    },
    { behavior: "immediate" },
  );
}
