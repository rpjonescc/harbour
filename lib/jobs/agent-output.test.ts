import { eq } from "drizzle-orm";
import { specForJob } from "@/lib/agents/specs";
import { actions, agentRuns, proposals } from "@/lib/db/schema";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { JobFailure } from "./agent-gate";
import { checkRequiredOutputs, importAgentOutput, readAgentOutput } from "./agent-output";
import { claimNextJob, enqueueJob, type Job } from "./queue";

const products = [
  {
    id: "acme-docs",
    name: "Acme Docs",
    url: "https://docs.example.com",
    hue: "amber" as const,
    kind: "product" as const,
  },
];
const context = { jobId: 1, products, today: "2026-10-04", weeklyExport: () => "{}" };
const NOW = new Date("2026-10-04T19:05:00Z");
const WEEKLY = "reports/weekly/2026-W40.proposals.json";
const DISCOVERY = "products/acme-docs/proposals.json";

const weeklyAction = {
  productId: "acme-docs",
  area: "GEO",
  title: "Answer the top buyer question on the home page",
  why: "AI assistants quote direct answers.",
  fix: "Add a short answer near the top.",
  check: "The answer is in the first paragraph.",
  impact: "high",
  effort: "small",
  evidence: [{ note: "No answer on the home page" }],
  docs: [],
};

function jobFor(db: ReturnType<typeof openTestDb>, kind: "discovery" | "weekly-analyst"): Job {
  const params: Record<string, string> =
    kind === "discovery" ? { productId: "acme-docs" } : { week: "2026-W40" };
  enqueueJob(db, kind, params, null, NOW);
  const job = claimNextJob(db, NOW);
  if (!job) throw new Error("expected a job");
  return job;
}

function run(kind: "discovery" | "weekly-analyst", files: Record<string, string>) {
  const db = openTestDb();
  const brain = makeBrain(files);
  const job = jobFor(db, kind);
  db.insert(agentRuns).values({ jobId: job.id, promptVersion: "test" }).run();
  const spec = specForJob(kind, job.params, context);
  const read = () => readAgentOutput(brain.root, spec, products);
  const imported = () => {
    const parsed = read();
    return parsed ? importAgentOutput(db, parsed, job, NOW) : null;
  };
  return { db, brain, job, read, imported };
}

describe("importAgentOutput", () => {
  it("imports nothing for a run without an output file", () => {
    const db = openTestDb();
    const spec = specForJob("research", { topic: "glossary" }, context);
    enqueueJob(db, "research", { topic: "glossary" }, null, NOW);
    const job = claimNextJob(db, NOW);
    if (!job) throw new Error("expected a job");
    expect(readAgentOutput("/nonexistent", spec, products)).toBeNull();
  });

  it("imports discovery proposals as proposed", () => {
    const file = {
      keywords: [{ term: "example widgets", intent: "commercial", why: "Core term" }],
      questions: [],
      competitors: [],
    };
    const { db, brain, imported } = run("discovery", { [DISCOVERY]: JSON.stringify(file) });
    try {
      expect(imported()).toBe("Imported 1 proposal(s); 0 already known");
      expect(db.select().from(proposals).all()).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("imports weekly proposals as suggested actions", () => {
    const text = JSON.stringify({ actions: [weeklyAction, weeklyAction] });
    const { db, brain, imported } = run("weekly-analyst", { [WEEKLY]: text });
    try {
      expect(imported()).toBe("Imported 1 action(s); 1 already known");
      expect(db.select().from(actions).all()).toMatchObject([{ status: "suggested" }]);
    } finally {
      brain.cleanup();
    }
  });

  it("imports a run's output once, however often it is asked", () => {
    const text = JSON.stringify({ actions: [weeklyAction] });
    const { db, brain, job, read, imported } = run("weekly-analyst", { [WEEKLY]: text });
    try {
      expect(imported()).toBe("Imported 1 action(s); 0 already known");
      const parsed = read();
      if (!parsed) throw new Error("expected output");
      expect(importAgentOutput(db, parsed, job, NOW)).toBeNull();
      expect(db.select().from(actions).all()).toHaveLength(1);
      expect(
        db.select().from(agentRuns).where(eq(agentRuns.jobId, job.id)).get()?.importedAt,
      ).toEqual(NOW);
    } finally {
      brain.cleanup();
    }
  });

  it("fails without importing on an unknown product or invalid JSON", () => {
    for (const text of [
      JSON.stringify({ actions: [weeklyAction, { ...weeklyAction, productId: "ghost" }] }),
      "{ nope",
    ]) {
      const { db, brain, read } = run("weekly-analyst", { [WEEKLY]: text });
      try {
        expect(read).toThrow(JobFailure);
        expect(read).toThrow(/weekly proposals file/);
        expect(db.select().from(actions).all()).toEqual([]);
      } finally {
        brain.cleanup();
      }
    }
  });

  it("refuses a file over its size limit before reading it", () => {
    const weekly = run("weekly-analyst", { [WEEKLY]: " ".repeat(256 * 1024 + 1) });
    const discovery = run("discovery", { [DISCOVERY]: " ".repeat(1024 * 1024 + 1) });
    try {
      expect(weekly.read).toThrow(/too large \(262145 bytes; the limit is 256 KiB\)/);
      expect(discovery.read).toThrow(/too large \(1048577 bytes; the limit is 1 MiB\)/);
    } finally {
      weekly.brain.cleanup();
      discovery.brain.cleanup();
    }
  });
});

describe("checkRequiredOutputs", () => {
  it("fails naming the first required file the run did not write", () => {
    const spec = specForJob("weekly-analyst", { week: "2026-W40" }, context);
    expect(() => checkRequiredOutputs(spec, [WEEKLY])).toThrow(
      new JobFailure("Agent did not write reports/weekly/2026-W40.md"),
    );
    expect(() => checkRequiredOutputs(spec, [WEEKLY, "reports/weekly/2026-W40.md"])).not.toThrow();
  });
});
