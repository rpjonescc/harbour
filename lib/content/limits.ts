import { and, gte, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { localTime, zonedInstant } from "@/lib/format/zoned-time";
import { CONTENT_AGENT_KINDS } from "@/lib/jobs/job-kinds";
import { enqueueJob } from "@/lib/jobs/queue";

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

function today(db: Db, since: Date) {
  return db
    .select()
    .from(jobs)
    .where(and(inArray(jobs.kind, [...CONTENT_AGENT_KINDS]), gte(jobs.createdAt, since)))
    .all();
}

/** Content agent runs created since local midnight, scheduled and manual together. */
export function contentRunsToday(db: Db, timeZone: string, now: Date): number {
  return today(db, startOfDay(timeZone, now)).length;
}

function manualLimitHit(db: Db, input: EnqueueInput): boolean {
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

/** Queues a content job unless the daily cap or the owner's own rate limit says no. */
export function enqueueContent(db: Db, input: EnqueueInput): EnqueueResult {
  // Types are erased at the HTTP and worker boundaries: an unknown kind must not fall through.
  if (!(CONTENT_AGENT_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error(`${input.kind} is not a content agent kind`);
  }
  if (!input.chained) {
    if (contentRunsToday(db, input.timeZone, input.now) >= input.dailyRuns) {
      return { ok: false, reason: "daily_cap" };
    }
    if (manualLimitHit(db, input)) return { ok: false, reason: "rate_limited" };
  }
  const job = enqueueJob(db, input.kind, input.params, input.requestedBy, input.now);
  return { ok: true, ...job };
}
