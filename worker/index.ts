// Harbour worker: runs queued jobs (agents, git sync, scans, backups, retention) one at a time. Started by systemd (`pnpm worker`).
// Must not import any module that imports "server-only".

import { makeSnoozeWaker } from "@/lib/actions/store";
import { quarantineRootFor } from "@/lib/agents/brain-status";
import { runProcess } from "@/lib/agents/process";
import { makeRefreshSchedule, type QueuedRefresh } from "@/lib/agents/refresh-schedule";
import { makeAnalystSchedule } from "@/lib/analyst/schedule";
import { getConfig } from "@/lib/config";
import { countWaitingIdeas, MAX_WAITING_IDEAS } from "@/lib/content/read/ideas";
import { readVoice } from "@/lib/content/read/voice";
import { makeDigestSchedule, makeIdeasSchedule } from "@/lib/content/schedule";
import { deferForOtherChain } from "@/lib/content/worker/chain-wait";
import { runContentDecision } from "@/lib/content/worker/decision-job";
import { runDigestJob } from "@/lib/content/worker/digest-job";
import { contentRunDeps, decisionDeps, resumeContentChains } from "@/lib/content/worker/wire";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { runNotesSyncJob, runPushJob } from "@/lib/jobs/git-jobs";
import { keepAlive } from "@/lib/jobs/heartbeat";
import { makeImportRetry } from "@/lib/jobs/import-retry";
import { isAgentJobKind } from "@/lib/jobs/job-kinds";
import { claimNextJob, heartbeat, type Job } from "@/lib/jobs/queue";
import { type RunDeps, runAgentJob } from "@/lib/jobs/run-job";
import { makeScanSchedule, type QueuedScan } from "@/lib/jobs/scan-schedule";
import { makeScheduler } from "@/lib/jobs/scheduler";
import { failUnknownJob } from "@/lib/jobs/unknown-job";
import { gatherFacts } from "@/lib/note/gather";
import { makeNoteSchedule, noteEnabled } from "@/lib/note/schedule";
import { type OpsJobDeps, runBackupJob, runRetentionJob } from "@/lib/ops/backup-job";
import { describeNextBackup, makeBackupSchedule } from "@/lib/ops/backup-schedule";
import { backupStatus } from "@/lib/ops/backup-status";
import { getContentProducts, getOwnerFirstName, getProducts } from "@/lib/products/catalog";
import { runOutsideCheck } from "@/lib/scan/run-outside-check";
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

const warnedIdeas = new Set<string>();

/** A product with a usable voice profile and room in its backlog; an unreadable brain queues nothing. */
function readyForIdeas(root: string, productId: string): boolean {
  try {
    const ready =
      readVoice(root, productId).state === "ok" &&
      countWaitingIdeas(root, productId) < MAX_WAITING_IDEAS;
    warnedIdeas.delete(productId);
    return ready;
  } catch {
    // Once per product until it reads again, not every 30 seconds.
    if (!warnedIdeas.has(productId)) {
      warnedIdeas.add(productId);
      console.warn(`ideas: could not read the brain for ${productId}; skipped`);
    }
    return false;
  }
}

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
  const analyst = makeAnalystSchedule({
    db,
    timeZone: config.HARBOUR_TIMEZONE,
    enabled: config.HARBOUR_SCHEDULED_ANALYST === "on",
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
    clock: Date.now,
    productIds: () => getProducts().map((p) => p.id),
  });
  const notes = makeNoteSchedule({
    db,
    timeZone: config.HARBOUR_TIMEZONE,
    noteTime: config.HARBOUR_NOTE_TIME,
    enabled: noteEnabled(config),
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
    clock: Date.now,
  });
  const logNote = (why: string, queued: { jobId: number; stamp: string } | null) => {
    if (queued) console.log(`${why}: queued daily note #${queued.jobId} for ${queued.stamp}`);
  };
  const digests = makeDigestSchedule({
    db,
    timeZone: config.HARBOUR_TIMEZONE,
    digestTime: config.HARBOUR_DIGEST_TIME,
    enabled: config.HARBOUR_CONTENT === "on" && config.HARBOUR_SCHEDULED_DIGEST === "on",
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
    keySet: Boolean(config.HARBOUR_SCREENPIPE_API_KEY),
    dailyRuns: config.HARBOUR_CONTENT_DAILY_RUNS,
    clock: Date.now,
  });
  const logDigest = (why: string, queued: { jobId: number; day: string } | null) => {
    if (queued) console.log(`${why}: queued content digest #${queued.jobId} for ${queued.day}`);
  };
  const ideas = makeIdeasSchedule({
    db,
    timeZone: config.HARBOUR_TIMEZONE,
    enabled: config.HARBOUR_CONTENT === "on" && config.HARBOUR_SCHEDULED_IDEAS === "on",
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
    dailyRuns: config.HARBOUR_CONTENT_DAILY_RUNS,
    clock: Date.now,
    productIds: () => getContentProducts().map((p) => p.id),
    isReady: (id) => readyForIdeas(root, id),
  });
  const logIdeas = (why: string, queued: readonly { jobId: number; productId: string }[]) => {
    for (const q of queued)
      console.log(`${why}: queued content ideas #${q.jobId} for ${q.productId}`);
  };
  const refreshes = makeRefreshSchedule({
    db,
    root,
    timeZone: config.HARBOUR_TIMEZONE,
    enabled: config.HARBOUR_SCHEDULED_RESEARCH === "on",
    tokenSet: Boolean(config.HARBOUR_CLAUDE_OAUTH_TOKEN),
    clock: Date.now,
  });
  const logRefreshes = (why: string, queued: readonly QueuedRefresh[]) => {
    for (const r of queued)
      console.log(`${why}: queued research refresh #${r.jobId} for ${r.topicId}`);
  };
  const backupsOn = config.HARBOUR_SCHEDULED_BACKUP === "on";
  const backups = makeBackupSchedule({
    db,
    timeZone: config.HARBOUR_TIMEZONE,
    enabled: backupsOn,
    clock: Date.now,
  });
  const logBackup = (why: string, queued: { jobId: number; day: string } | null) => {
    if (queued) console.log(`${why}: queued backup #${queued.jobId} for ${queued.day}`);
  };
  const snoozes = makeSnoozeWaker({ db, timeZone: config.HARBOUR_TIMEZONE, clock: Date.now });
  const logAnalyst = (why: string, queued: { jobId: number; week: string } | null) => {
    if (queued) console.log(`${why}: queued weekly analyst #${queued.jobId} for ${queued.week}`);
  };
  const imports = makeImportRetry({
    db,
    root,
    products: getProducts,
    clock: Date.now,
  });
  scheduler.startup();
  failInterruptedScans(db); // their jobs were just failed by startup()
  const resumed = resumeContentChains({ db, root, config, now: () => new Date() });
  if (resumed > 0) console.log(`resumed ${resumed} content chain(s) interrupted by the last stop`);
  logQueued("catch-up", scans.catchUp());
  logAnalyst("catch-up", analyst.tick());
  logNote("catch-up", notes.tick());
  logDigest("catch-up", digests.tick());
  logIdeas("catch-up", ideas.tick());
  logRefreshes("catch-up", refreshes.tick());
  logBackup("catch-up", backups.tick());
  console.log(
    `harbour-worker ready; ${describeNextBackup(new Date(), config.HARBOUR_TIMEZONE, backupsOn)}`,
  );

  const opsDeps = (now: () => Date): OpsJobDeps => ({
    db,
    config,
    productIds: () => getProducts().map((p) => p.id),
    now,
    stopping: () => stopping,
  });

  const agentDeps = (now: () => Date): RunDeps => ({
    db,
    root,
    quarantineRoot,
    bin: config.HARBOUR_CLAUDE_BIN,
    token: config.HARBOUR_CLAUDE_OAUTH_TOKEN,
    model: config.HARBOUR_AGENT_MODEL,
    timeoutMs: config.HARBOUR_AGENT_TIMEOUT_MINUTES * 60_000,
    products: getProducts(),
    today: isoDateIn(config.HARBOUR_TIMEZONE, new Date()),
    timeZone: config.HARBOUR_TIMEZONE,
    home: process.env.HOME ?? "",
    path: process.env.PATH ?? "",
    run: runProcess,
    now,
    stopping: () => stopping,
    noteFacts: (at) =>
      gatherFacts({
        db,
        products: getProducts(),
        ownerFirstName: getOwnerFirstName(),
        timeZone: config.HARBOUR_TIMEZONE,
        root,
        backup: backupStatus(db, config, at).health,
        now: at,
      }),
    ...contentRunDeps({ db, root, config, now }),
  });

  const scanDeps = (now: () => Date) =>
    workerScanDeps({ db, config, products: getProducts(), now, stopping: () => stopping });

  const runJob = async (job: Job) => {
    const now = () => new Date();
    if (deferForOtherChain(db, job)) return; // a draft waits for another idea's chain
    if (job.kind === "brain-push") {
      scheduler.pushed(runPushJob({ db, root, now }, job));
    } else if (job.kind === "notes-sync") {
      scheduler.notesSynced(runNotesSyncJob({ db, root, quarantineRoot, now }, job));
    } else if (job.kind === "scan") {
      // Scans never touch the brain, so they don't wait for it to be quiet.
      await runScan(scanDeps(now), job);
    } else if (job.kind === "outside-check") {
      await runOutsideCheck(scanDeps(now), job);
    } else if (job.kind === "backup") {
      await runBackupJob(opsDeps(now), job);
    } else if (job.kind === "retention") {
      await runRetentionJob(opsDeps(now), job);
    } else if (job.kind === "content-digest") {
      const apiKey = config.HARBOUR_SCREENPIPE_API_KEY;
      const { pushed } = await runDigestJob(
        {
          ...agentDeps(now),
          screenpipe: apiKey ? { baseUrl: config.HARBOUR_SCREENPIPE_URL, apiKey } : null,
        },
        job,
      );
      if (pushed !== null) scheduler.pushed(pushed);
    } else if (job.kind === "content-decision") {
      const deps = decisionDeps({ db, root, quarantineRoot, config, now });
      const { pushed } = runContentDecision(deps, job);
      if (pushed !== null) scheduler.pushed(pushed);
    } else if (isAgentJobKind(job.kind)) {
      const { pushed } = await runAgentJob(agentDeps(now), job);
      // A failed agent push backs off like any other, instead of retrying at the next check.
      if (pushed !== null) scheduler.pushed(pushed);
    } else {
      // A kind with no runner here (e.g. queued by a newer version) fails instead of reaching an agent.
      failUnknownJob(db, job, now());
    }
  };

  while (!stopping) {
    scheduler.tick(); // between jobs only: never during a run
    logQueued("daily", scans.tick());
    logAnalyst("weekly", analyst.tick());
    logNote("daily", notes.tick());
    logDigest("daily", digests.tick());
    logIdeas("weekly", ideas.tick());
    logRefreshes("monthly", refreshes.tick());
    logBackup("nightly", backups.tick());
    const woken = snoozes.tick();
    if (woken > 0) console.log(`woke ${woken} snoozed action(s)`);
    const reimported = imports.tick(); // committed agent output whose import failed
    if (reimported > 0) console.log(`re-imported the output of ${reimported} agent run(s)`);
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
