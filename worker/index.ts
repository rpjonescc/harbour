// Harbour worker: runs queued agent jobs one at a time. Started by systemd (`pnpm worker`).
// Must not import any module that imports "server-only".
import { dirname, join } from "node:path";
import { runProcess } from "@/lib/agents/process";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { housekeepingAction } from "@/lib/jobs/housekeeping";
import {
  claimNextJob,
  enqueueJob,
  getJob,
  heartbeat,
  type Job,
  recoverStaleJobs,
} from "@/lib/jobs/queue";
import { runAgentJob, runNotesSyncJob, runPushJob } from "@/lib/jobs/run-job";
import { getProducts } from "@/lib/products/catalog";

const IDLE_MS = 2000;
const HEARTBEAT_MS = 10_000;
const AUTOSAVE_CHECK_MS = 30_000;
const AUTOSAVE_QUIET_MS = 2 * 60_000;
const PUSH_RETRY_MS = 10 * 60_000;

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Decides, between jobs only, whether to queue an autosave or a push retry. */
function makeHousekeeping(root: string, db: ReturnType<typeof getDb>) {
  let lastCheck = 0;
  let lastPushRetry = 0;
  // A failed autosave is retried on the push schedule, not every check.
  let notesRetryAt = 0;
  return {
    tick() {
      const now = Date.now();
      if (now - lastCheck < AUTOSAVE_CHECK_MS) return;
      lastCheck = now;
      const action = housekeepingAction(root, new Date(now), {
        quietMs: AUTOSAVE_QUIET_MS,
        pushRetryDue: now - lastPushRetry >= PUSH_RETRY_MS,
      });
      if (action === "notes-sync" && now >= notesRetryAt) enqueueJob(db, "notes-sync", {}, null);
      if (action === "brain-push") {
        lastPushRetry = now;
        enqueueJob(db, "brain-push", {}, null);
      }
    },
    finished(job: Job) {
      if (job.kind === "notes-sync" && getJob(db, job.id)?.status === "failed") {
        notesRetryAt = Date.now() + PUSH_RETRY_MS;
      }
    },
  };
}

async function main() {
  const config = getConfig();
  const db = getDb();
  const root = config.HARBOUR_BRAIN_DIR;
  const recovered = recoverStaleJobs(db);
  if (recovered > 0) console.warn(`recovered ${recovered} stale job(s)`);
  const housekeeping = makeHousekeeping(root, db);
  console.log("harbour-worker ready");

  while (!stopping) {
    housekeeping.tick();
    const job = claimNextJob(db);
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    console.log(`job ${job.id} (${job.kind}) started`);
    const beat = setInterval(() => heartbeat(db, job.id), HEARTBEAT_MS);
    try {
      const now = () => new Date();
      if (job.kind === "brain-push") {
        runPushJob({ db, root, now }, job);
      } else if (job.kind === "notes-sync") {
        runNotesSyncJob({ db, root, now }, job);
      } else {
        await runAgentJob(
          {
            db,
            root,
            quarantineRoot: join(dirname(config.HARBOUR_DB_PATH), "quarantine"),
            bin: config.HARBOUR_CLAUDE_BIN,
            token: config.HARBOUR_CLAUDE_OAUTH_TOKEN,
            model: config.HARBOUR_AGENT_MODEL,
            timeoutMs: config.HARBOUR_AGENT_TIMEOUT_MINUTES * 60_000,
            products: getProducts(),
            today: isoDateIn(config.HARBOUR_TIMEZONE, new Date()),
            home: process.env.HOME ?? "",
            path: process.env.PATH ?? "",
            run: runProcess,
            now,
          },
          job,
        );
      }
    } finally {
      clearInterval(beat);
      housekeeping.finished(job);
      console.log(`job ${job.id} finished`);
    }
  }
}

main().catch((error) => {
  console.error("harbour-worker crashed", error);
  process.exit(1);
});
