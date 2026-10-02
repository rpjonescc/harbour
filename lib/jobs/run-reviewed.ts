import type { RunOutcome } from "@/lib/agents/process";
import type { AgentSpec } from "@/lib/agents/specs";
import type { StreamResult } from "@/lib/agents/stream";
import type { EventKind } from "./queue";

/** One CLI invocation: how it ended and the result line it streamed, if any. */
export type Attempt = { outcome: RunOutcome; result: StreamResult | undefined };

export type ReviewedRun = {
  spec: Pick<AgentSpec, "prompt" | "review">;
  root: string;
  /** The whole time budget for every attempt together. */
  totalMs: number;
  now: () => Date;
  stopping: () => boolean;
  event: (kind: EventKind, text: string) => void;
  attempt: (prompt: string, timeoutMs: number) => Promise<Attempt>;
};

const finished = ({ outcome, result }: Attempt) =>
  outcome.exitCode === 0 && !outcome.timedOut && !outcome.cancelled && !result?.isError;

/**
 * Runs the agent, and when the spec has a review and the run exited cleanly but wrote something
 * the review rejects, runs it exactly once more with the reason fed back. A CLI failure, timeout
 * or cancel is not a rejection: no retry. The retry gets only the time the first attempt left.
 * Returns the last attempt; the caller still makes the final accept-or-fail decision.
 */
export async function runReviewed(run: ReviewedRun): Promise<Attempt> {
  const started = run.now().getTime();
  const first = await run.attempt(run.spec.prompt, run.totalMs);
  const review = run.spec.review;
  if (!review || !finished(first) || run.stopping()) return first;
  const reason = review.check(run.root);
  if (reason === null) return first;
  const left = run.totalMs - (run.now().getTime() - started);
  if (left <= 0) {
    run.event("status", `The checker rejected the output (${reason}); no time left to retry`);
    return first;
  }
  run.event("status", `The checker rejected the output (${reason}); asking the agent once more`);
  review.reset(run.root);
  return run.attempt(review.retryPrompt(reason), left);
}
