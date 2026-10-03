import { approvedPillars } from "@/lib/agents/pillars";
import type { Config } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import type { Job } from "@/lib/jobs/queue";
import type { RunDeps } from "@/lib/jobs/run-job";
import { getContentProducts, getExcludeApps, getPostizChannels } from "@/lib/products/catalog";
import { type ChainDeps, chainHook, resumeChains } from "./chain-controller";
import { type DecisionDeps, runContentDecision } from "./decision-job";
import { type PostizJobDeps, runPostizJob } from "./postiz-job";

type Wiring = { db: Db; root: string; config: Config; now: () => Date };

const chainDeps = ({ db, root, config, now }: Wiring): ChainDeps => ({
  db,
  root,
  timeZone: config.HARBOUR_TIMEZONE,
  dailyRuns: config.HARBOUR_CONTENT_DAILY_RUNS,
  now,
});

/** The content machine's part of a run's deps: its inputs and its chain; nothing when it is off. */
export function contentRunDeps(w: Wiring): Pick<RunDeps, "content" | "afterOk"> {
  if (w.config.HARBOUR_CONTENT !== "on") return {};
  return {
    content: {
      root: w.root,
      skillsDir: w.config.HARBOUR_SKILLS_DIR,
      products: getContentProducts(),
      excludeApps: getExcludeApps(),
      approvedPillars: (id) => approvedPillars(w.db, id),
    },
    afterOk: chainHook(chainDeps(w)),
  };
}

/** At startup: queues the step a chain lost when the worker last stopped; how many it queued. */
export function resumeContentChains(w: Wiring): number {
  return w.config.HARBOUR_CONTENT === "on" ? resumeChains(chainDeps(w)) : 0;
}

/** What the decision job needs: the brain, where interrupted runs wait, and the products with content on. */
const decisionDeps = (w: Wiring & { quarantineRoot: string }): DecisionDeps => ({
  enabled: w.config.HARBOUR_CONTENT === "on",
  db: w.db,
  root: w.root,
  quarantineRoot: w.quarantineRoot,
  now: w.now,
  timeZone: w.config.HARBOUR_TIMEZONE,
  products: getContentProducts(),
});

/** What a Postiz send needs: the decision job's brain access, the channels, and Postiz itself (or null). */
const postizDeps = (w: Wiring & { quarantineRoot: string }): PostizJobDeps => {
  const { HARBOUR_POSTIZ_URL: baseUrl, HARBOUR_POSTIZ_API_KEY: apiKey } = w.config;
  return {
    ...decisionDeps(w),
    channels: getPostizChannels(),
    postiz: baseUrl && apiKey ? { baseUrl, apiKey } : null,
  };
};

type ContentWrite = Job & { kind: "content-decision" | "content-postiz" };

/** A content job that runs no model and writes the brain itself: a decision or a Postiz send. */
export const isContentWrite = (job: Job): job is ContentWrite =>
  job.kind === "content-decision" || job.kind === "content-postiz";

/** Runs a decision or a Postiz send with its deps; `pushed` is null when nothing was committed. */
export async function runContentWrite(
  w: Wiring & { quarantineRoot: string },
  job: ContentWrite,
): Promise<{ pushed: boolean | null }> {
  if (job.kind === "content-decision") return runContentDecision(decisionDeps(w), job);
  return runPostizJob(postizDeps(w), job);
}
