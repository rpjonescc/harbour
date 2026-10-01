// Harbour worker: runs queued agent jobs one at a time. Started by systemd (`pnpm worker`).
// Must not import any module that imports "server-only".
import { quarantineRootFor } from "@/lib/agents/brain-status";
import { runProcess } from "@/lib/agents/process";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { runNotesSyncJob, runPushJob } from "@/lib/jobs/git-jobs";
import { claimNextJob, heartbeat, type Job } from "@/lib/jobs/queue";
import { runAgentJob } from "@/lib/jobs/run-job";
import { makeScheduler } from "@/lib/jobs/scheduler";
import { getProducts } from "@/lib/products/catalog";

const IDLE_MS = 2000;
const HEARTBEAT_MS = 10_000;

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const config = getConfig();
  const db = getDb();
  const root = config.HARBOUR_BRAIN_DIR;
  const quarantineRoot = quarantineRootFor(config.HARBOUR_DB_PATH);
  const scheduler = makeScheduler({ db, root, quarantineRoot, clock: Date.now });
  scheduler.startup();
  console.log("harbour-worker ready");

  const runJob = async (job: Job) => {
    const now = () => new Date();
    if (job.kind === "brain-push") {
      scheduler.pushed(runPushJob({ db, root, now }, job));
    } else if (job.kind === "notes-sync") {
      scheduler.notesSynced(runNotesSyncJob({ db, root, quarantineRoot, now }, job));
    } else {
      await runAgentJob(
        {
          db,
          root,
          quarantineRoot,
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
          stopping: () => stopping,
        },
        job,
      );
    }
  };

  while (!stopping) {
    scheduler.tick(); // between jobs only: never during an agent run
    const job = claimNextJob(db);
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    console.log(`job ${job.id} (${job.kind}) started`);
    const beat = setInterval(() => heartbeat(db, job.id), HEARTBEAT_MS);
    try {
      await runJob(job);
    } finally {
      clearInterval(beat);
      console.log(`job ${job.id} finished`);
    }
  }
}

main().catch((error) => {
  console.error("harbour-worker crashed", error);
  process.exit(1);
});
