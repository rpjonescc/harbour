import { enqueueContent } from "@/lib/content/limits";
import { claimNextJob, listJobs } from "@/lib/jobs/queue";
import { runAgentJob } from "@/lib/jobs/run-job";
import { seedPieces } from "@/tests/helpers/chain";
import { CHAIN_WORKS, contentSetup, ideaFile, VOICE_ACME } from "@/tests/helpers/content";
import { afterContentJob } from "./chain-controller";

const IDEA = "acme-docs-20261001-five-minutes";
const BASE = {
  "content/voices/acme-docs.md": VOICE_ACME,
  "products/acme-docs/notes.md": "# Acme Docs\n\nA first deploy takes about five minutes.\n",
};
/** What atomise starts from: the idea being written and its source piece, with no platform pieces yet. */
const beforeAtomise = () => ({
  ...Object.fromEntries(
    Object.entries(seedPieces(IDEA)).filter(([path]) => path.endsWith("/source.md")),
  ),
  [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile({
    state: "drafting",
    sources: ["product:acme-docs"],
  }),
});
const queued = (s: ReturnType<typeof contentSetup>) =>
  listJobs(s.deps.db, 50)
    .filter((j) => j.status === "queued")
    .map((j) => `${j.kind}${j.params.gate ? `:${j.params.gate}:${j.params.attempt}` : ""}`);
const kick = (
  s: ReturnType<typeof contentSetup>,
  kind: "content-draft" | "content-atomise" | "content-gate",
  params: Record<string, string>,
) =>
  enqueueContent(s.deps.db, {
    kind,
    params,
    requestedBy: "me",
    timeZone: "Europe/London",
    now: new Date(),
    dailyRuns: 24,
  });
const deps = (s: ReturnType<typeof contentSetup>) => ({
  db: s.deps.db,
  root: s.brain.root,
  timeZone: "Europe/London",
  dailyRuns: 1,
  now: () => new Date(),
});
async function runFirst(s: ReturnType<typeof contentSetup>) {
  const job = claimNextJob(s.deps.db);
  if (!job) throw new Error("expected a queued job");
  await runAgentJob(s.deps, job);
  return listJobs(s.deps.db, 50).find((j) => j.id === job.id) ?? job;
}

describe("afterContentJob", () => {
  it("queues atomise after a draft that moved the idea to drafting, and nothing after a draft that stopped at the number check", async () => {
    const ok = contentSetup(CHAIN_WORKS, {
      ...BASE,
      [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile(),
    });
    try {
      kick(ok, "content-draft", { ideaId: IDEA });
      afterContentJob(deps(ok), await runFirst(ok));
      expect(queued(ok)).toEqual(["content-atomise"]);
    } finally {
      ok.cleanup();
    }
    const bad = contentSetup(
      {
        draft: {
          ...CHAIN_WORKS.draft,
          paragraphs: CHAIN_WORKS.draft.paragraphs.map((p, i) =>
            i === 0 ? { ...p, text: `${p.text} Founded in 2019.` } : p,
          ),
        },
      },
      { ...BASE, [`content/ideas/acme-docs/${IDEA}.md`]: ideaFile() },
    );
    try {
      kick(bad, "content-draft", { ideaId: IDEA });
      afterContentJob(deps(bad), await runFirst(bad));
      expect(queued(bad)).toEqual([]);
    } finally {
      bad.cleanup();
    }
  });

  it("queues no-ai-slop after atomise, humanizer after a clean slop, and a revision after a failed one", async () => {
    const s = contentSetup(
      {
        ...CHAIN_WORKS,
        "gate:no-ai-slop:1": {
          pieces: CHAIN_WORKS["gate:no-ai-slop:1"].pieces.map((p) =>
            p.platform === "x"
              ? { ...p, findings: [{ pattern: "Colon reveals", quote: "q", fix: "f" }] }
              : p,
          ),
        },
      },
      { ...BASE, ...beforeAtomise() },
    );
    try {
      kick(s, "content-atomise", { ideaId: IDEA });
      const atomise = await runFirst(s);
      afterContentJob(deps(s), atomise);
      expect(queued(s)).toEqual(["content-gate:no-ai-slop:1"]);
      afterContentJob(deps(s), await runFirst(s));
      expect(queued(s)).toEqual(["content-gate:no-ai-slop:2"]);
    } finally {
      s.cleanup();
    }
  });

  it("queues nothing after a failed job", async () => {
    const s = contentSetup({}, { ...BASE, ...seedPieces(IDEA) }); // no fixture: the fake CLI fails the run
    try {
      kick(s, "content-atomise", { ideaId: IDEA });
      const job = await runFirst(s);
      expect(job.status).toBe("failed");
      afterContentJob(deps(s), job);
      expect(queued(s)).toEqual([]);
    } finally {
      s.cleanup();
    }
  });

  it("lets a chained step pass a daily cap the chain has already used up", async () => {
    const s = contentSetup(CHAIN_WORKS, { ...BASE, ...beforeAtomise() });
    try {
      kick(s, "content-atomise", { ideaId: IDEA });
      const job = await runFirst(s); // deps() has dailyRuns 1, and this run reached it
      afterContentJob(deps(s), job);
      expect(queued(s)).toEqual(["content-gate:no-ai-slop:1"]);
    } finally {
      s.cleanup();
    }
  });
});
