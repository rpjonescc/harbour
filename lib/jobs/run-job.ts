import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  commitChanges,
  discardRun,
  inspectRun,
  pushBrain,
  type RunSnapshot,
  snapshotRun,
} from "@/lib/agents/brain-git";
import { agentEnv, claudeArgs } from "@/lib/agents/claude-args";
import type { RunOutcome, runProcess } from "@/lib/agents/process";
import { PROMPT_VERSION } from "@/lib/agents/prompts";
import { importProposals, type Proposals, parseProposals } from "@/lib/agents/proposals";
import { type AgentSpec, specForJob } from "@/lib/agents/specs";
import { type StreamResult, summariseLine } from "@/lib/agents/stream";
import type { Db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import { finish, recoveryBlock, saveOwnerNotes } from "./git-jobs";
import { addEvent, type EventKind, isCancelRequested, type Job } from "./queue";
import { freshQuarantineDir, removeRunMarker, writeRunMarker } from "./run-marker";

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

/** An expected, owner-readable failure (as opposed to a crash, which is also logged). */
class JobFailure extends Error {}

// Ignored files editors rewrite on their own; changes to these never fail a run.
const BENIGN_TAMPER = [/(^|\/)\.DS_Store$/, /^\.obsidian\/workspace(-mobile)?\.json$/];

const MAX_PROPOSALS_BYTES = 1024 * 1024;

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
  const blocked = recoveryBlock(deps.quarantineRoot);
  if (blocked) throw new JobFailure(blocked);
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

/** Throws unless the CLI finished successfully. */
function checkOutcome(deps: RunDeps, outcome: RunOutcome, result: StreamResult | undefined) {
  if (outcome.timedOut) throw new JobFailure(`Timed out after ${describeDuration(deps.timeoutMs)}`);
  if (outcome.exitCode !== 0 || result?.isError) {
    const detail = result?.text || outcome.stderrTail.slice(-300) || `exit ${outcome.exitCode}`;
    throw new JobFailure(`Agent failed: ${detail}`);
  }
}

/** The git gate: returns the paths to commit, or throws when the run touched anything else. */
function gatedPaths(root: string, snapshot: RunSnapshot, spec: AgentSpec): string[] {
  const inspection = inspectRun(root, snapshot, spec.allowed);
  if (inspection.gitTampered.length > 0) {
    throw new JobFailure(`Agent changed git metadata: ${inspection.gitTampered.join(", ")}`);
  }
  const tampered = inspection.tampered.filter((p) => !BENIGN_TAMPER.some((re) => re.test(p)));
  if (tampered.length > 0)
    throw new JobFailure(`Agent changed ignored files: ${tampered.join(", ")}`);
  if (inspection.rejected.length > 0) {
    const paths = inspection.rejected.map((c) => c.path).join(", ");
    throw new JobFailure(`Agent changed files outside its area: ${paths}`);
  }
  if (inspection.allowed.length === 0)
    throw new JobFailure("Agent finished without writing anything");
  return inspection.allowed.map((c) => c.path);
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

/** Runs one research/discovery job end to end; always finishes the job row. */
export async function runAgentJob(deps: RunDeps, job: Job): Promise<void> {
  const { db, root } = deps;
  const event = (kind: EventKind, text: string) => addEvent(db, job.id, kind, text, deps.now());
  const setRun = (values: Partial<typeof agentRuns.$inferInsert>) =>
    db.update(agentRuns).set(values).where(eq(agentRuns.jobId, job.id)).run();
  let snapshot: RunSnapshot | undefined;
  const discard = (reason: string) => {
    if (!snapshot) return;
    const dir = freshQuarantineDir(deps.quarantineRoot, job.id);
    const { quarantined } = discardRun(root, snapshot, dir);
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
    const token = checkPreconditions(deps, spec);
    const saved = saveOwnerNotes(root);
    if (saved > 0) event("status", `Saved ${saved} note file(s) before starting`);
    snapshot = snapshotRun(root);
    // Durable before the agent starts: if the worker dies mid-run, startup recovery discards.
    writeRunMarker(deps.quarantineRoot, job.id, snapshot);

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
        for (const e of summary.events) event(e.kind, e.text);
        if (summary.result) result = summary.result;
      },
      shouldCancel: () => deps.stopping() || isCancelRequested(db, job.id),
    });
    setRun({
      exitCode: outcome.exitCode,
      stdoutTail: outcome.stdoutTail,
      stderrTail: outcome.stderrTail,
    });
    if (outcome.cancelled) {
      try {
        discard("Cancelled");
      } catch (discardError) {
        discardFailed(discardError); // the marker stays, so recovery retries
      }
      event("status", deps.stopping() ? "Cancelled: the worker is stopping" : "Cancelled");
      finish(db, job.id, "cancelled", null, deps.now());
      return;
    }
    checkOutcome(deps, outcome, result);

    const paths = gatedPaths(root, snapshot, spec);
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
  }
}
