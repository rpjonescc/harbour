// The outside view's history table: what is written (validated), pruned and read back. Web-safe:
// no collector imports, only the shared shapes.
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "@/lib/db/client";
import { externalChecks } from "@/lib/db/schema";
import {
  type AiAnswer,
  aiAnswerValue,
  type Backlinks,
  backlinksValue,
  host,
  type SerpRank,
  serpRankValue,
  TREG_CHECKS,
  type TregCheck,
} from "@/lib/scan/treg-shapes";
import type { Observation } from "@/lib/scan/types";

const DAY_MS = 24 * 60 * 60_000;
/** How long a check is kept. */
export const KEEP_DAYS = 400;
const MAX_SUBJECT = 200;
const MAX_VALUE_BYTES = 4096;
/** Most rows one read looks at, so a product page never loads an unbounded history. */
const MAX_READ = 2000;

const SHAPES: Record<TregCheck, z.ZodType<Record<string, unknown>>> = {
  backlinks: backlinksValue,
  serp_rank: serpRankValue,
  ai_answer: aiAnswerValue,
};

/** The subject a value must agree with (a search's subject is its query), or null for any. */
const OWN_SUBJECT: Record<TregCheck, string | null> = {
  backlinks: null,
  serp_rank: "query",
  ai_answer: "question",
};

const isCheck = (kind: string): kind is TregCheck =>
  (TREG_CHECKS as readonly string[]).includes(kind);

export type CopyResult = { written: number; alreadyKept: number; dropped: number };

type ValidRow = {
  kind: TregCheck;
  subject: string;
  checkedAt: Date;
  value: Record<string, unknown>;
};

/** The row an observation becomes, or null when it does not pass its shape and limits. */
function validRow(observation: Observation): ValidRow | null {
  const { kind, subject } = observation;
  if (!isCheck(kind) || subject.length < 1 || subject.length > MAX_SUBJECT) return null;
  const parsed = SHAPES[kind].safeParse(observation.value);
  if (!parsed.success) return null;
  const value = parsed.data;
  const own = OWN_SUBJECT[kind];
  if (own !== null && value[own] !== subject) return null;
  // A links check's subject is a host name; the others' subjects were just checked as value.query/question.
  if (own === null && !host.safeParse(subject).success) return null;
  const checkedAt = new Date(String(value.checkedAt));
  if (Number.isNaN(checkedAt.getTime())) return null;
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_VALUE_BYTES) return null;
  return { kind, subject, checkedAt, value };
}

/**
 * Copies the check observations of a run into the history, keeping only those that pass their
 * shape (the rest are counted, not stored). Writing the same check again changes nothing.
 * `treg_summary` and every other kind are not history and are ignored without being counted.
 */
export function saveExternalChecks(
  db: Db,
  input: {
    productId: string;
    scanId: number | null;
    jobId: number | null;
    observations: readonly Observation[];
  },
): CopyResult {
  const result: CopyResult = { written: 0, alreadyKept: 0, dropped: 0 };
  const candidates = input.observations.filter((o) => isCheck(o.kind));
  db.transaction((tx) => {
    for (const observation of candidates) {
      const row = validRow(observation);
      if (!row) {
        result.dropped += 1;
        continue;
      }
      const { changes } = tx
        .insert(externalChecks)
        .values({ ...row, productId: input.productId, scanId: input.scanId, jobId: input.jobId })
        .onConflictDoNothing()
        .run();
      if (changes === 1) result.written += 1;
      else result.alreadyKept += 1;
    }
  });
  return result;
}

/** Deletes checks older than 400 days; returns how many. */
export function pruneExternalChecks(db: Db, now: Date): number {
  const before = new Date(now.getTime() - KEEP_DAYS * DAY_MS);
  return db.delete(externalChecks).where(lt(externalChecks.checkedAt, before)).run().changes;
}

/** What each kind of check stores. */
export type ShapeOf = { backlinks: Backlinks; serp_rank: SerpRank; ai_answer: AiAnswer };

export type StoredCheck<T> = { subject: string; checkedAt: Date; value: T };

/**
 * A product's checks of one kind from the last `days` days, newest first. Each is read back
 * through its shape; a row that no longer passes is skipped, never guessed at.
 */
export function readChecks<K extends TregCheck>(
  db: Db,
  productId: string,
  kind: K,
  days: number,
  now: Date,
): StoredCheck<ShapeOf[K]>[] {
  const since = new Date(now.getTime() - days * DAY_MS);
  const rows = db
    .select()
    .from(externalChecks)
    .where(
      and(
        eq(externalChecks.productId, productId),
        eq(externalChecks.kind, kind),
        gte(externalChecks.checkedAt, since),
      ),
    )
    .orderBy(desc(externalChecks.checkedAt), desc(externalChecks.id))
    .limit(MAX_READ)
    .all();
  const out: StoredCheck<Record<string, unknown>>[] = [];
  for (const row of rows) {
    const parsed = SHAPES[kind].safeParse(row.value);
    if (parsed.success)
      out.push({ subject: row.subject, checkedAt: row.checkedAt, value: parsed.data });
  }
  // Each value passed the shape of its own kind just above.
  return out as StoredCheck<ShapeOf[K]>[];
}
