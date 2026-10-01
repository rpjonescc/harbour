import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRun } from "@/lib/agents/brain-git";
import { runProcess } from "@/lib/agents/process";
import { agentRuns, proposals } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { claimNextJob, enqueueJob, eventsSince, getJob, type Job, requestCancel } from "./queue";
import { type RunDeps, runAgentJob, runNotesSyncJob } from "./run-job";

const FAKE = join(process.cwd(), "tests/fixtures/fake-claude.mjs");
const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const },
];

function setup(
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
    ...overrides,
  };
  return { brain, db, deps };
}

function claim(deps: Pick<RunDeps, "db">): Job {
  const job = claimNextJob(deps.db);
  if (!job) throw new Error("expected a queued job");
  return job;
}

function reload(deps: Pick<RunDeps, "db">, id: number): Job {
  const job = getJob(deps.db, id);
  if (!job) throw new Error(`expected job ${id}`);
  return job;
}

async function runOne(
  deps: RunDeps,
  kind: "research" | "discovery",
  params: Record<string, string>,
) {
  enqueueJob(deps.db, kind, params, null);
  const job = claim(deps);
  await runAgentJob(deps, job);
  return reload(deps, job.id);
}

describe("runAgentJob", () => {
  it("commits the research document, pushes, and records activity", async () => {
    const { brain, db, deps } = setup("success");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s")).toMatch(/^agent\(research\): Glossary/);
      expect(brain.git("status", "--porcelain")).toBe("");
      expect(brain.git("rev-list", "--count", "@{upstream}..HEAD").trim()).toBe("0");
      const run = db.select().from(agentRuns).get();
      expect(run).toMatchObject({
        pushed: true,
        filesChanged: ["research/glossary.md"],
        promptVersion: "2b-v1",
        exitCode: 0,
      });
      expect(run?.commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toEqual(
        expect.arrayContaining(["Searching: fake research query", "Writing: research/glossary.md"]),
      );
    } finally {
      brain.cleanup();
    }
  });

  it("fails and restores everything when the agent writes outside its area", async () => {
    const { brain, deps } = setup("escape");
    try {
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/outside\.md/);
      expect(existsSync(join(brain.root, "outside.md"))).toBe(false);
      expect(
        existsSync(join(brain.remote, "..", "quarantine", `job-${job.id}`, "outside.md")),
      ).toBe(true);
      expect(existsSync(join(brain.root, "research/glossary.md"))).toBe(false);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("uses a fresh quarantine folder when the job's folder is already in use", async () => {
    const { brain, deps } = setup("escape");
    try {
      const stale = join(deps.quarantineRoot, "job-1");
      mkdirSync(stale, { recursive: true });
      writeFileSync(join(stale, "old.md"), "# older run\n");
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.id).toBe(1);
      expect(job.error).toMatch(/outside\.md/);
      expect(existsSync(join(brain.root, "outside.md"))).toBe(false);
      expect(existsSync(join(deps.quarantineRoot, "job-1-2", "outside.md"))).toBe(true);
    } finally {
      brain.cleanup();
    }
  });

  it("imports discovery proposals as proposed", async () => {
    const { brain, db, deps } = setup("success", { "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const job = await runOne(deps, "discovery", { productId: "acme-docs" });
      expect(job.status).toBe("ok");
      const rows = db.select().from(proposals).all();
      expect(rows.map((p) => p.status)).toEqual(["proposed", "proposed", "proposed"]);
      expect(rows.every((p) => p.sourceJobId === job.id && p.productId === "acme-docs")).toBe(true);
    } finally {
      brain.cleanup();
    }
  });

  it("fails without importing when proposals are invalid", async () => {
    const { brain, db, deps } = setup("bad-json", { "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const job = await runOne(deps, "discovery", { productId: "acme-docs" });
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/not valid JSON/);
      expect(db.select().from(proposals).all()).toEqual([]);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("refuses discovery without owner notes", async () => {
    const a = setup("success");
    try {
      expect((await runOne(a.deps, "discovery", { productId: "acme-docs" })).error).toMatch(
        /notes\.md/,
      );
    } finally {
      a.brain.cleanup();
    }
  });

  it("fails an unknown topic without crashing", async () => {
    const a = setup("success");
    try {
      const job = await runOne(a.deps, "research", { topic: "nope" });
      expect(job).toMatchObject({ status: "failed", error: "Unknown research topic: nope" });
    } finally {
      a.brain.cleanup();
    }
  });

  it("saves the owner's unsaved notes in their own commit before running", async () => {
    const a = setup("success");
    try {
      writeFileSync(join(a.brain.root, "draft.md"), "# draft\n");
      const job = await runOne(a.deps, "research", { topic: "glossary" });
      expect(job.status).toBe("ok");
      const subjects = a.brain.git("log", "--format=%s", "-2").trim().split("\n");
      expect(subjects[1]).toMatch(/^notes: owner update \(1 file/);
      expect(subjects[0]).toMatch(/^agent\(research\)/);
      expect(a.brain.git("show", "--stat", "--format=", "HEAD")).not.toContain("draft.md");
    } finally {
      a.brain.cleanup();
    }
  });

  it("fails clearly without a token, on CLI error, when nothing is written, and on timeout", async () => {
    const cases: [string, Partial<RunDeps>, RegExp][] = [
      ["success", { token: undefined }, /HARBOUR_CLAUDE_OAUTH_TOKEN/],
      ["fail", {}, /Not logged in/],
      ["noop", {}, /without writing/i],
      ["slow", { timeoutMs: 300 }, /timed out/i],
    ];
    for (const [scenario, overrides, expected] of cases) {
      const s = setup(scenario, {}, overrides);
      try {
        const job = await runOne(s.deps, "research", { topic: "glossary" });
        expect(job.status, scenario).toBe("failed");
        expect(job.error, scenario).toMatch(expected);
        expect(s.brain.git("status", "--porcelain"), scenario).toBe("");
      } finally {
        s.brain.cleanup();
      }
    }
  });

  it("cancels, discarding partial work", async () => {
    const { brain, db, deps } = setup("slow");
    try {
      enqueueJob(db, "research", { topic: "glossary" }, null);
      const job = claim(deps);
      setTimeout(() => requestCancel(db, job.id), 150);
      await runAgentJob(deps, job);
      expect(getJob(db, job.id)?.status).toBe("cancelled");
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("keeps the commit and reports when the push fails", async () => {
    const { brain, db, deps } = setup("success");
    try {
      brain.git("remote", "set-url", "origin", "/nonexistent/remote.git");
      const job = await runOne(deps, "research", { topic: "glossary" });
      expect(job.status).toBe("ok");
      expect(brain.git("log", "-1", "--format=%s")).toMatch(/^agent\(research\)/);
      expect(db.select().from(agentRuns).get()?.pushed).toBe(false);
      expect(
        eventsSince(db, job.id, 0).some((e) => e.kind === "error" && /push failed/i.test(e.text)),
      ).toBe(true);
    } finally {
      brain.cleanup();
    }
  });
});

describe("runNotesSyncJob", () => {
  it("commits the owner's uncommitted note and pushes", () => {
    const { brain, db, deps } = setup("success");
    try {
      writeFileSync(join(brain.root, "draft.md"), "# draft\n");
      enqueueJob(db, "notes-sync", {}, null);
      const job = claim(deps);
      runNotesSyncJob(deps, job);
      expect(reload(deps, job.id)).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s").trim()).toBe("notes: owner update (1 file(s))");
      expect(brain.git("status", "--porcelain")).toBe("");
      expect(brain.git("rev-list", "--count", "@{upstream}..HEAD").trim()).toBe("0");
      // A later agent run is no longer blocked by "uncommitted changes".
      expect(() => snapshotRun(brain.root)).not.toThrow();
    } finally {
      brain.cleanup();
    }
  });

  it("finishes ok with nothing to save", () => {
    const { brain, db, deps } = setup("success");
    try {
      enqueueJob(db, "notes-sync", {}, null);
      const job = claim(deps);
      runNotesSyncJob(deps, job);
      expect(reload(deps, job.id).status).toBe("ok");
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toContain("Nothing to save");
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });
});
