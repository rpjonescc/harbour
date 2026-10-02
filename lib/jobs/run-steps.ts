import { commitChanges, pushBrain } from "@/lib/agents/brain-git";
import { agentEnv, claudeArgs } from "@/lib/agents/claude-args";
import type { AgentSpec } from "@/lib/agents/specs";
import { type AgentEvent, type StreamResult, summariseLine } from "@/lib/agents/stream";
import type { agentRuns } from "@/lib/db/schema";
import { JobFailure, recordTouched } from "./agent-gate";
import { importAfterCommit, readAgentOutput } from "./agent-output";
import { finish } from "./git-jobs";
import { type EventKind, isCancelRequested, type Job } from "./queue";
import type { RunDeps } from "./run-job";
import { removeRunMarker } from "./run-marker";
import type { Attempt } from "./run-reviewed";
import type { TouchedLog } from "./touched-log";

// The steps of an agent run that sit between the git gate and the finished job row.

/** What a quiet run says when the agent did not finish: no agent text, ever. */
export const QUIET_FAILURE = "The note agent didn't finish.";
/** Stands in for the output tails of a run whose words must not be kept (see `AgentSpec.quiet`). */
export const QUIET_TAIL = "(not recorded for the daily note)";

export type AttemptInput = {
  deps: RunDeps;
  job: Job;
  spec: AgentSpec;
  token: string;
  log: TouchedLog;
  event: (kind: EventKind, text: string) => void;
};

/** Records a stream event; a quiet run keeps no agent text, and tool errors lose their detail. */
function quietly(spec: AgentSpec, e: AgentEvent, event: AttemptInput["event"]): void {
  if (!spec.quiet) event(e.kind, e.text);
  else if (e.kind === "error") event("error", "A tool call failed");
  else if (e.kind === "tool")
    event("tool", "Used a tool"); // the path is the agent's choice
  else if (e.kind !== "text") event(e.kind, e.text);
}

/** One CLI invocation that records the files it writes and its activity as it streams. */
export function cliAttempt({ deps, job, spec, token, log, event }: AttemptInput) {
  const { root, db } = deps;
  return async (prompt: string, timeoutMs: number): Promise<Attempt> => {
    let result: StreamResult | undefined; // each attempt reports its own result
    const outcome = await deps.run({
      bin: deps.bin,
      args: claudeArgs(prompt, deps.model, spec.tools),
      cwd: root,
      env: agentEnv(token, deps.home, deps.path),
      timeoutMs,
      onLine: (line) => {
        const summary = summariseLine(line, root);
        for (const raw of summary.touched)
          recordTouched(root, log, raw, (text) => event("error", text));
        for (const e of summary.events) quietly(spec, e, event);
        if (summary.result) result = summary.result;
      },
      shouldCancel: () => deps.stopping() || isCancelRequested(db, job.id),
    });
    return { outcome, result };
  };
}

/**
 * The final word on a reviewed run: output still rejected means nothing is committed; accepted
 * output is moved to its final place immediately before the commit.
 */
export function publishReviewed(spec: AgentSpec, root: string): string | null {
  const review = spec.review;
  if (!review) return null;
  const rejected = review.check(root);
  if (rejected !== null) throw new JobFailure(`The agent's output was rejected: ${rejected}`);
  return review.publish(root);
}

type CommitInput = {
  deps: RunDeps;
  job: Job;
  spec: AgentSpec;
  paths: string[];
  event: (kind: EventKind, text: string) => void;
  setRun: (values: Partial<typeof agentRuns.$inferInsert>) => unknown;
  /** What `publishReviewed` returned: stored on the job when it succeeds. */
  result: string | null;
};

/**
 * Commits exactly `paths`, imports the run's structured output, pushes, and finishes the job.
 * `committed` runs right after the commit, so the caller stops treating the run as discardable.
 */
export function commitAndPush(
  { deps, job, spec, paths, event, setRun, result }: CommitInput,
  committed: () => void,
): { pushed: boolean } {
  const { db, root } = deps;
  // Validated before the commit: invalid output is discarded with the run, never imported.
  const output = readAgentOutput(root, spec, deps.products);
  const message = `agent(${spec.kind}): ${spec.label.replace(/^[^:]+:\s*/, "")}`;
  const sha = commitChanges(root, paths, message);
  committed();
  // Recorded first: a run with a commit and no import is what the import retry looks for.
  setRun({ filesChanged: paths, commitSha: sha });
  removeRunMarker(deps.quarantineRoot, job.id);
  event("status", `Committed ${paths.length} file(s)`);

  if (output) importAfterCommit(db, output, job, deps.now(), event);

  const push = pushBrain(root);
  setRun({ pushed: push.ok });
  if (push.ok) event("status", "Pushed to the brain repository");
  else event("error", `Push failed — commit kept locally, will retry automatically: ${push.error}`);
  finish(db, job.id, "ok", null, deps.now(), result);
  return { pushed: push.ok };
}
