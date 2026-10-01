// Harbour worker: runs queued jobs (agents, git sync, scans) one at a time. Started by systemd (`pnpm worker`).
// Must not import any module that imports "server-only".
import { quarantineRootFor } from "@/lib/agents/brain-status";
import { runProcess } from "@/lib/agents/process";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { runNotesSyncJob, runPushJob } from "@/lib/jobs/git-jobs";
import { keepAlive } from "@/lib/jobs/heartbeat";
import { claimNextJob, heartbeat, type Job } from "@/lib/jobs/queue";
import { runAgentJob } from "@/lib/jobs/run-job";
import { makeScanSchedule, type QueuedScan } from "@/lib/jobs/scan-schedule";
import { makeScheduler } from "@/lib/jobs/scheduler";
import { getProducts } from "@/lib/products/catalog";
import { runScan } from "@/lib/scan/run-scan";
import { failInterruptedScans } from "@/lib/scan/store";
import { workerScanDeps } from "@/lib/scan/worker-deps";

const IDLE_MS = 2000;
const HEARTBEAT_MS = 10_000;

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const logQueued = (why: string, scans: readonly QueuedScan[]) => {
  for (const s of scans) console.log(`${why}: queued scan #${s.jobId} for ${s.productId}`);
};

async function main() {
  const config = getConfig();
  const db = getDb();
  const root = config.HARBOUR_BRAIN_DIR;
  const quarantineRoot = quarantineRootFor(config.HARBOUR_DB_PATH);
  const scheduler = makeScheduler({ db, root, quarantineRoot, clock: Date.now });
  const scans = makeScanSchedule({
    db,
    timeZone: config.HARBOUR_TIMEZONE,
    enabled: config.HARBOUR_SCHEDULED_SCANS === "on",
    clock: Date.now,
    productIds: () => getProducts().map((p) => p.id),
  });
  scheduler.startup();
  failInterruptedScans(db); // their jobs were just failed by startup()
  logQueued("catch-up", scans.catchUp());
  console.log("harbour-worker ready");

  const runJob = async (job: Job) => {
    const now = () => new Date();
    if (job.kind === "brain-push") {
      scheduler.pushed(runPushJob({ db, root, now }, job));
    } else if (job.kind === "notes-sync") {
      scheduler.notesSynced(runNotesSyncJob({ db, root, quarantineRoot, now }, job));
    } else if (job.kind === "scan") {
      // Scans never touch the brain, so they don't wait for it to be quiet.
      const deps = workerScanDeps({
        db,
        config,
        products: getProducts(),
        now,
        stopping: () => stopping,
      });
      await runScan(deps, job);
    } else {
      const { pushed } = await runAgentJob(
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
      // A failed agent push backs off like any other, instead of retrying at the next check.
      if (pushed !== null) scheduler.pushed(pushed);
    }
  };

  while (!stopping) {
    scheduler.tick(); // between jobs only: never during a run
    logQueued("daily", scans.tick());
    const job = claimNextJob(db);
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    console.log(`job ${job.id} (${job.kind}) started`);
    const stopBeat = keepAlive(job.id, () => heartbeat(db, job.id), HEARTBEAT_MS);
    try {
      await runJob(job);
    } finally {
      stopBeat();
      console.log(`job ${job.id} finished`);
    }
  }
}

main().catch((error) => {
  console.error("harbour-worker crashed", error);
  process.exit(1);
});
