import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { discardRun } from "@/lib/agents/brain-discard";
import { commitChanges, pushBrain, type RunSnapshot, snapshotRun } from "@/lib/agents/brain-git";
import { agentEnv, claudeArgs } from "@/lib/agents/claude-args";
import type { RunOutcome, runProcess } from "@/lib/agents/process";
import { PROMPT_VERSION } from "@/lib/agents/prompts";
import { importProposals, type Proposals, parseProposals } from "@/lib/agents/proposals";
import { type AgentSpec, specForJob } from "@/lib/agents/specs";
import { type StreamResult, summariseLine } from "@/lib/agents/stream";
import type { Db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import { gatedPaths, JobFailure, recordTouched } from "./agent-gate";
import { brainRootError, finish, recoveryBlock, saveOwnerNotes } from "./git-jobs";
import { newestOwnerChange } from "./housekeeping";
import { addEvent, deferJob, type EventKind, isCancelRequested, type Job } from "./queue";
import {
  freshQuarantineDir,
  removeRunMarker,
  type TouchedLog,
  touchedLog,
  writeRunMarker,
} from "./run-marker";

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
  home: string;
  path: string;
  run: typeof runProcess;
  now: () => Date;
  /** True once the worker is shutting down: the run is cancelled and discarded. */
  stopping: () => boolean;
};

const MAX_PROPOSALS_BYTES = 1024 * 1024;

// How long the brain must be unchanged before an agent run starts.
const QUIET_MS = 3 * 60_000;
const WAITING = "Waiting for the brain to be quiet (changes in the last 3 minutes)";

function describeDuration(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`;
}

function specOrFail(deps: RunDeps, job: Job): AgentSpec {
  if (job.kind !== "research" && job.kind !== "discovery") {
    throw new JobFailure(`Not an agent job: ${job.kind}`);
  }
  try {
    return specForJob(job.kind, job.params, deps.products, deps.today);
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
  for (const file of spec.requiredFiles) {
    if (!existsSync(join(deps.root, file))) {
      throw new JobFailure(`Missing ${file} — write the owner's notes for this product first`);
    }
  }
  return deps.token;
}

/**
 * Puts the job back in the queue while the brain changed in the last QUIET_MS (the owner is
 * still editing): an agent run would commit their half-written notes. Returns true if deferred.
 */
function deferWhileEditing(deps: RunDeps, job: Job): boolean {
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
function checkOutcome(deps: RunDeps, outcome: RunOutcome, result: StreamResult | undefined) {
  if (outcome.timedOut) throw new JobFailure(`Timed out after ${describeDuration(deps.timeoutMs)}`);
  if (outcome.exitCode !== 0 || result?.isError) {
    const detail = result?.text || outcome.stderrTail.slice(-300) || `exit ${outcome.exitCode}`;
    throw new JobFailure(`Agent failed: ${detail}`);
  }
}

function readProposals(root: string, spec: AgentSpec, paths: string[]): Proposals | null {
  if (!spec.proposalsPath) return null;
  if (!paths.includes(spec.proposalsPath)) {
    throw new JobFailure(`Agent did not write ${spec.proposalsPath}`);
  }
  const file = join(root, spec.proposalsPath);
  const { size } = statSync(file);
  if (size > MAX_PROPOSALS_BYTES) {
    throw new JobFailure(`${spec.proposalsPath} is too large (${size} bytes; the limit is 1 MiB)`);
  }
  try {
    return parseProposals(readFileSync(file, "utf8"));
  } catch (error) {
    throw new JobFailure((error as Error).message);
  }
}

const STOPPED = "Cancelled — the worker was stopped";

/**
 * Runs one research/discovery job end to end; always finishes the job row. `pushed` is whether
 * the agent's commit reached the remote (null when nothing was committed), for the push backoff.
 */
export async function runAgentJob(deps: RunDeps, job: Job): Promise<{ pushed: boolean | null }> {
  const { db, root } = deps;
  const event = (kind: EventKind, text: string) => addEvent(db, job.id, kind, text, deps.now());
  const setRun = (values: Partial<typeof agentRuns.$inferInsert>) =>
    db.update(agentRuns).set(values).where(eq(agentRuns.jobId, job.id)).run();
  let snapshot: RunSnapshot | undefined;
  let touched: TouchedLog | undefined;
  const discard = (reason: string) => {
    if (!snapshot) return;
    const dir = freshQuarantineDir(deps.quarantineRoot, job.id);
    const { quarantined } = discardRun(root, snapshot, dir, touched?.touched() ?? "all");
    snapshot = undefined;
    removeRunMarker(deps.quarantineRoot, job.id);
    if (quarantined.length > 0) {
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
    const spec = specOrFail(deps, job);
    const blocked = brainRootError(root) ?? recoveryBlock(deps.quarantineRoot);
    if (blocked) throw new JobFailure(blocked);
    if (deferWhileEditing(deps, job)) return { pushed: null };
    const token = checkPreconditions(deps, spec);
    const saved = saveOwnerNotes(root);
    if (saved > 0) event("status", `Saved ${saved} note file(s) before starting`);
    snapshot = snapshotRun(root);
    // Durable before the agent starts: if the worker dies mid-run, startup recovery discards.
    writeRunMarker(deps.quarantineRoot, job.id, snapshot);
    const log = touchedLog(deps.quarantineRoot, job.id);
    touched = log;

    db.insert(agentRuns).values({ jobId: job.id, promptVersion: PROMPT_VERSION }).run();
    event("status", `Started ${spec.label}`);
    let result: StreamResult | undefined;
    const outcome = await deps.run({
      bin: deps.bin,
      args: claudeArgs(spec.prompt, deps.model),
      cwd: root,
      env: agentEnv(token, deps.home, deps.path),
      timeoutMs: deps.timeoutMs,
      onLine: (line) => {
        const summary = summariseLine(line, root);
        for (const raw of summary.touched)
          recordTouched(root, log, raw, (text) => event("error", text));
        for (const e of summary.events) event(e.kind, e.text);
        if (summary.result) result = summary.result;
      },
      shouldCancel: () => deps.stopping() || isCancelRequested(db, job.id),
    });
    log.seal(); // every output line has been read: the touched list is complete
    setRun({
      exitCode: outcome.exitCode,
      stdoutTail: outcome.stdoutTail,
      stderrTail: outcome.stderrTail,
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
    checkOutcome(deps, outcome, result);

    const paths = gatedPaths(root, snapshot, spec, log.touched(), (text) => event("status", text));
    const parsed = readProposals(root, spec, paths);
    const sha = commitChanges(
      root,
      paths,
      `agent(${spec.kind}): ${spec.label.replace(/^[^:]+:\s*/, "")}`,
    );
    snapshot = undefined; // committed: nothing left to discard
    removeRunMarker(deps.quarantineRoot, job.id);
    setRun({ filesChanged: paths, commitSha: sha });
    event("status", `Committed ${paths.length} file(s)`);

    if (parsed && job.kind === "discovery") {
      const productId = job.params.productId ?? "";
      const { added, skipped } = importProposals(db, productId, parsed, job.id, deps.now());
      event("status", `Imported ${added} proposal(s); ${skipped} already known`);
    }

    const push = pushBrain(root);
    setRun({ pushed: push.ok });
    if (push.ok) event("status", "Pushed to the brain repository");
    else
      event("error", `Push failed — commit kept locally, will retry automatically: ${push.error}`);
    finish(db, job.id, "ok", null, deps.now());
    return { pushed: push.ok };
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
