import { join } from "node:path";
import { runProcess } from "@/lib/agents/process";
import { claimNextJob, enqueueJob, getJob, type Job } from "@/lib/jobs/queue";
import { type RunDeps, runAgentJob } from "@/lib/jobs/run-job";
import { openTestDb } from "./db";
import { makeGitBrain } from "./git-brain";

const FAKE = join(process.cwd(), "tests/fixtures/fake-claude.mjs");
const products = [
  {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber" as const,
    kind: "product" as const,
  },
];

/** A git brain, in-memory DB and RunDeps driving the fake CLI with `scenario`. */
export function setup(
  scenario: string,
  files: Record<string, string> = {},
  overrides: Partial<RunDeps> = {},
) {
  const brain = makeGitBrain(files);
  const db = openTestDb();
  const deps: RunDeps = {
    db,
    root: brain.root,
    quarantineRoot: join(brain.remote, "..", "quarantine"),
    bin: FAKE,
    token: "test-token",
    model: "sonnet",
    timeoutMs: 20_000,
    products,
    today: "2026-10-01",
    timeZone: "Europe/London",
    home: brain.root,
    path: process.env.PATH ?? "",
    run: (o) =>
      runProcess({
        ...o,
        env: { ...o.env, FAKE_CLAUDE_SCENARIO: scenario },
        pollMs: 50,
        killGraceMs: 500,
      }),
    now: () => new Date(),
    stopping: () => false,
    ...overrides,
  };
  return { brain, db, deps };
}

export function claim(deps: Pick<RunDeps, "db">): Job {
  const job = claimNextJob(deps.db);
  if (!job) throw new Error("expected a queued job");
  return job;
}

export function reload(deps: Pick<RunDeps, "db">, id: number): Job {
  const job = getJob(deps.db, id);
  if (!job) throw new Error(`expected job ${id}`);
  return job;
}

export async function runOne(
  deps: RunDeps,
  kind: "research" | "discovery" | "weekly-analyst" | "daily-note",
  params: Record<string, string>,
) {
  enqueueJob(deps.db, kind, params, null);
  const job = claim(deps);
  await runAgentJob(deps, job);
  return reload(deps, job.id);
}
