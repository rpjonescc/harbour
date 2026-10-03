// Reads what the tower's eight system lights need. I/O only; lib/tower/system.ts shapes it.

import { and, desc, eq } from "drizzle-orm";
import {
  type BrainSyncStatus,
  brainSyncStatus,
  quarantineRootFor,
} from "@/lib/agents/brain-status";
import type { Named } from "@/lib/agents/view";
import type { Config } from "@/lib/config";
import { type CostMeterView, costMeterView } from "@/lib/costs/meter-view";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import type { Job, JobKind, JobStatus } from "@/lib/jobs/queue";
import { type BackupStatus, backupStatus } from "@/lib/ops/backup-status";
import { type WorkerLiveness, workerLiveness } from "@/lib/ops/worker-beat";
import type { Product } from "@/lib/products/catalog";
import { type ScheduleRow, scheduleRows } from "@/lib/settings/view";
import { productToday } from "@/lib/today/from-scans";
import type { SourceFailure } from "@/lib/today/types";
import { towerSyncRead } from "./brain-sync-cache";
import { agentActivity, lastFinishedJob } from "./jobs-data";
import { WEB_STARTED_AT } from "./web-started";

export type ScheduleFact = { row: ScheduleRow; lastRun: { status: JobStatus; at: Date } | null };

export type CheckFact = {
  productId: string;
  productName: string;
  scannedAt: Date | null;
  scanning: boolean;
  failedAt: Date | null;
};

export type SystemFacts = {
  webStartedAt: Date;
  worker: WorkerLiveness;
  schedules: ScheduleFact[];
  checks: CheckFact[];
  backup: BackupStatus;
  brain: BrainSyncStatus;
  /** When the Second Brain's notes were last saved (an ok notes sync); null when never. */
  notesSavedAt: Date | null;
  failures: SourceFailure[];
  agents: { running: Job[]; queued: Job[]; failedUnretried: Job[]; finishedToday: number };
  cost: CostMeterView;
  /** Names for job labels ("Check: Acme Docs"). */
  products: Named[];
};

/** The job each schedule queues; the research refresh is a research job in refresh mode. */
const SCHEDULE_JOB: Readonly<Record<ScheduleRow["id"], JobKind>> = {
  scan: "scan",
  analyst: "weekly-analyst",
  refresh: "research",
  backup: "backup",
  note: "daily-note",
  digest: "content-digest",
  ideas: "content-ideas",
};

function lastNotesSave(db: Db): Date | null {
  const row = db
    .select({ at: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.kind, "notes-sync"), eq(jobs.status, "ok")))
    .orderBy(desc(jobs.id))
    .get();
  return row?.at ?? null;
}

/** Everything the systems strip reads, with one bounded query per source. */
export function systemFacts(
  db: Db,
  config: Config,
  products: readonly Product[],
  now: Date,
): SystemFacts {
  const tokenSet = Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN);
  const perProduct = products.map((p) => ({ product: p, today: productToday(db, p, now) }));
  return {
    webStartedAt: WEB_STARTED_AT,
    worker: workerLiveness(db, now),
    schedules: scheduleRows(config, now, tokenSet).map((row) => ({
      row,
      lastRun: lastFinishedJob(db, SCHEDULE_JOB[row.id], row.id === "refresh"),
    })),
    checks: perProduct.map(({ product, today }) => ({
      productId: product.id,
      productName: product.name,
      scannedAt: today.scannedAt,
      scanning: today.scanning,
      failedAt: today.failedAt,
    })),
    backup: backupStatus(db, config, now),
    brain: brainSyncStatus(
      config.HARBOUR_BRAIN_DIR,
      quarantineRootFor(config.HARBOUR_DB_PATH),
      towerSyncRead(now),
    ),
    notesSavedAt: lastNotesSave(db),
    failures: perProduct.flatMap(({ today }) => today.failures),
    agents: agentActivity(db, now, config.HARBOUR_TIMEZONE),
    cost: costMeterView(db, config, now),
    products: products.map(({ id, name }) => ({ id, name })),
  };
}
