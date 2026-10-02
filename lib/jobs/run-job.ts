import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { discardRun } from "@/lib/agents/brain-discard";
import { type RunSnapshot, snapshotRun } from "@/lib/agents/brain-git";
import type { RunOutcome, runProcess } from "@/lib/agents/process";
import { type AgentSpec, specForJob } from "@/lib/agents/specs";
import type { StreamResult } from "@/lib/agents/stream";
import { buildWeeklyExport } from "@/lib/analyst/export";
import { capExport } from "@/lib/analyst/export-cap";
import type { ContentRunContext } from "@/lib/content/worker/run-context";
import type { Db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { Facts } from "@/lib/explain/voice/facts";
import type { Product } from "@/lib/products/catalog";
import { gatedPaths, JobFailure } from "./agent-gate";
import { checkRequiredOutputs } from "./agent-output";
import { brainRootError, finish, recoveryBlock, saveOwnerNotes } from "./git-jobs";
import { newestOwnerChange } from "./housekeeping";
import { addEvent, deferJob, type EventKind, type Job } from "./queue";
import { freshQuarantineDir, removeRunMarker, writeRunMarker } from "./run-marker";
import { runReviewed } from "./run-reviewed";
import { cliAttempt, commitAndPush, publishReviewed, QUIET_FAILURE, QUIET_TAIL } from "./run-steps";
import { type TouchedLog, touchedLog } from "./touched-log";

/** A transaction (or the database): what a step queued after a job finishes may read and write. */
export type JobTx = Pick<Db, "select" | "insert" | "update">;
/**
 * What to queue after a job succeeds. Decided before the job is finished and carried out in the
 * same transaction that finishes it, so no other job can be claimed between the two and a restart
 * never finds a finished job whose next step was lost. Returns a note for the job's activity.
 */
export type AfterOk = (job: Job) => ((tx: JobTx) => string | null) | null;

export type RunDeps = {
  db: Db;
  root: string;
  /** Directory (outside the brain) that holds one quarantine folder per discarded run. */
  quarantineRoot: string;
  bin: string;
  token: string | undefined;
  model: string;
  timeoutMs: number;
  products: readonly Product[];
  today: string;
  /** HARBOUR_TIMEZONE: local dates in the weekly export. */
  timeZone: string;
  home: string;
  path: string;
  run: typeof runProcess;
  now: () => Date;
  /** True once the worker is shutting down: the run is cancelled and discarded. */
  stopping: () => boolean;
  /** The daily note's facts snapshot (worker only; absent in tests that do not run a note). */
  noteFacts?: (now: Date) => Facts;
  /** Content machine inputs (worker only). */
  content?: ContentRunContext;
  /** The content chain's next step (worker only; see `AfterOk`). */
  afterOk?: AfterOk;
};

// How long the brain must be unchanged before an agent run starts.
const QUIET_MS = 3 * 60_000;
const WAITING = "Waiting for the brain to be quiet (changes in the last 3 minutes)";

function describeDuration(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`;
}

function specOrFail(deps: RunDeps, job: Job): AgentSpec {
  const { db, products, timeZone } = deps;
  const weeklyExport = (week: string) =>
    capExport(buildWeeklyExport(db, { products, week, now: deps.now(), timeZone }));
  const gather = deps.noteFacts;
  try {
    return specForJob(job.kind, job.params, {
      products,
      today: deps.today,
      weeklyExport,
      noteFacts: gather && (() => gather(deps.now())),
      jobId: job.id,
      content: deps.content,
      now: deps.now,
    });
  } catch (error) {
    throw new JobFailure((error as Error).message);
  }
}

function checkPreconditions(deps: RunDeps, spec: AgentSpec): string {
  if (!deps.token) {
    throw new JobFailure(
      "HARBOUR_CLAUDE_OAUTH_TOKEN is not set — run `claude setup-token` and add it to .env",
    );
  }
  const fix =
    spec.kind === "research"
      ? "run the research sprint to write it first"
      : "write the owner's notes for this product first";
  for (const file of spec.requiredFiles) {
    if (!existsSync(join(deps.root, file))) throw new JobFailure(`Missing ${file} — ${fix}`);
  }
  return deps.token;
}

/**
 * Puts the job back in the queue while the brain changed in the last QUIET_MS (the owner is
 * still editing): an agent run would commit their half-written notes. Returns true if deferred.
 */
export function deferWhileEditing(deps: RunDeps, job: Job): boolean {
  const now = deps.now();
  const newest = newestOwnerChange(deps.root, now);
  if (newest === null || now.getTime() - newest >= QUIET_MS) return false;
  if (!deferJob(deps.db, job.id, new Date(newest + QUIET_MS))) {
    console.warn(`job ${job.id} was no longer running; not deferred`);
    return true;
  }
  // Once per job: a deferred job carries notBefore when it is claimed again.
  if (job.notBefore === null) addEvent(deps.db, job.id, "status", WAITING, now);
  return true;
}

/** Throws unless the CLI finished successfully. */
function checkOutcome(
  spec: AgentSpec,
  timeoutMs: number,
  outcome: RunOutcome,
  result: StreamResult | undefined,
) {
  if (outcome.timedOut) throw new JobFailure(`Timed out after ${describeDuration(timeoutMs)}`);
  if (outcome.exitCode !== 0 || result?.isError) {
    // A quiet run's agent text can hold the note and the owner's name: it never reaches the record.
    if (spec.quiet) throw new JobFailure(spec.quietFailure ?? QUIET_FAILURE);
    const detail = result?.text || outcome.stderrTail.slice(-300) || `exit ${outcome.exitCode}`;
    throw new JobFailure(`Agent failed: ${detail}`);
  }
}

const STOPPED = "Cancelled — the worker was stopped";

/**
 * Runs one agent job (research, discovery, weekly analyst, daily note) end to end; always finishes the job row. `pushed` is whether
 * the agent's commit reached the remote (null when nothing was committed), for the push backoff.
 */
export async function runAgentJob(deps: RunDeps, job: Job): Promise<{ pushed: boolean | null }> {
  const { db, root } = deps;
  const event = (kind: EventKind, text: string) => addEvent(db, job.id, kind, text, deps.now());
  const setRun = (values: Partial<typeof agentRuns.$inferInsert>) =>
    db.update(agentRuns).set(values).where(eq(agentRuns.jobId, job.id)).run();
  let snapshot: RunSnapshot | undefined;
  let touched: TouchedLog | undefined;
  let noQuarantine = false;
  const discard = (reason: string) => {
    if (!snapshot) return;
    const dir = freshQuarantineDir(deps.quarantineRoot, job.id);
    const wrote = touched?.touched() ?? "all";
    const { quarantined } = discardRun(root, snapshot, dir, wrote);
    snapshot = undefined;
    removeRunMarker(deps.quarantineRoot, job.id);
    // Only for a run whose files may hold screen text, and only when every file moved was written
    // by the agent (a path the worker publishes counts as the agent's). The manifest goes with
    // them. A crash never reaches here: startup recovery quarantines, and keeps, those files.
    if (noQuarantine && wrote !== "all" && quarantined.every((path) => wrote.has(path))) {
      rmSync(dir, { recursive: true, force: true });
      if (quarantined.length > 0)
        event("status", `${reason}: ${quarantined.length} file(s) deleted`);
    } else if (quarantined.length > 0) {
      event("status", `${reason}: ${quarantined.length} file(s) moved to quarantine (${dir})`);
    }
  };
  const discardFailed = (discardError: unknown) => {
    console.error(`job ${job.id}: could not discard the agent's changes`, discardError);
    event(
      "error",
      `Could not discard the agent's changes — they will be moved to quarantine automatically: ${(discardError as Error).message}`,
    );
  };
  try {
    const blocked = brainRootError(root) ?? recoveryBlock(deps.quarantineRoot);
    if (blocked) throw new JobFailure(blocked);
    if (deferWhileEditing(deps, job)) return { pushed: null };
    // After the deferral: a waiting job never builds the weekly export, which is dated now.
    const spec = specOrFail(deps, job);
    noQuarantine = spec.noQuarantine === true;
    const token = checkPreconditions(deps, spec);
    const saved = saveOwnerNotes(root);
    if (saved > 0) event("status", `Saved ${saved} note file(s) before starting`);
    snapshot = snapshotRun(root);
    // Durable before the agent starts: if the worker dies mid-run, startup recovery discards.
    writeRunMarker(deps.quarantineRoot, job.id, snapshot);
    const log = touchedLog(deps.quarantineRoot, job.id);
    touched = log;
    // A reviewed run is published by the worker, not written by the agent: if it is discarded
    // after publishing, the published file must count as the run's own.
    if (spec.review) for (const path of spec.allowed.exact) log.record(path);

    db.insert(agentRuns).values({ jobId: job.id, promptVersion: spec.promptVersion }).run();
    event("status", `Started ${spec.label}`);
    const totalMs = Math.min(deps.timeoutMs, spec.timeoutMs ?? deps.timeoutMs);
    const attempt = cliAttempt({ deps, job, spec, token, log, event });
    const last = await runReviewed({
      spec,
      root,
      totalMs,
      now: deps.now,
      stopping: deps.stopping,
      event: (kind, text) => event(kind, text),
      attempt,
    });
    const { outcome, result } = last;
    log.seal(); // every output line has been read: the touched list is complete
    setRun({
      exitCode: outcome.exitCode,
      stdoutTail: spec.quiet ? QUIET_TAIL : outcome.stdoutTail,
      stderrTail: spec.quiet ? QUIET_TAIL : outcome.stderrTail,
    });
    // A stopping worker's agent may die of the group SIGTERM before the cancel poll sees it;
    // an agent that finished cleanly is still committed.
    const succeeded = outcome.exitCode === 0 && !outcome.timedOut && !result?.isError;
    if (outcome.cancelled || (deps.stopping() && !succeeded)) {
      try {
        discard("Cancelled");
      } catch (discardError) {
        discardFailed(discardError); // the marker stays, so recovery retries
      }
      const stopped = deps.stopping();
      event("status", stopped ? STOPPED : "Cancelled");
      finish(db, job.id, "cancelled", stopped ? STOPPED : null, deps.now());
      return { pushed: null };
    }
    checkOutcome(spec, totalMs, outcome, result);

    const digest = publishReviewed(spec, root, log, (text) => event("status", text));
    const paths = gatedPaths(
      root,
      snapshot,
      spec,
      log.touched(),
      (text) => event("status", text),
      spec.quiet === true,
    );
    checkRequiredOutputs(spec, paths); // a half-done run is discarded, never committed
    const { pushed } = commitAndPush(
      { deps, job, spec, paths, event, setRun, result: digest },
      () => {
        snapshot = undefined; // committed: nothing left to discard
      },
    );
    return { pushed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof JobFailure)) console.error(`job ${job.id} crashed`, error);
    try {
      discard("Discarded");
    } catch (discardError) {
      discardFailed(discardError);
    }
    event("error", message);
    finish(db, job.id, "failed", message, deps.now());
    return { pushed: null };
  }
}
