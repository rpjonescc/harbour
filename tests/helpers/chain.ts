import { renderFile } from "@/lib/content/files";
import { PLATFORMS } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { renderGates } from "@/lib/content/read/pieces";
import { chainHook } from "@/lib/content/worker/chain-controller";
import { claimNextJob } from "@/lib/jobs/queue";
import { runAgentJob } from "@/lib/jobs/run-job";
import { type contentSetup, ideaFile, pieceFile } from "./content";

/** The files of a drafted idea: the idea, a source piece and six `drafting` pieces with empty sidecars. */
export function seedPieces(
  ideaId = "acme-docs-20261001-five-minutes",
  over: Record<string, unknown> = {},
): Record<string, string> {
  const files: Record<string, string> = {
    [`content/ideas/acme-docs/${ideaId}.md`]: ideaFile({
      state: "drafted",
      sources: ["product:acme-docs"],
    }),
    [`content/pieces/${ideaId}/source.md`]: renderFile(
      {
        title: "Five minutes to a first deploy",
        kind: "content-source",
        ideaId,
        productId: "acme-docs",
        paragraphs: ["p1", "p2"],
        facts: ["product:acme-docs"],
        questions: [],
        createdBy: "job-1",
        skills: [],
      },
      "Publish docs in a short first deploy.\n\nConnect a repository and press publish.",
    ),
  };
  for (const platform of PLATFORMS) {
    files[contentPaths.piece(ideaId, platform)] = pieceFile(ideaId, platform, over);
    files[contentPaths.gates(ideaId, platform)] = renderGates([]);
  }
  return files;
}

/** `seedPieces` with a passing no-ai-slop and humanizer entry in every sidecar: only the facts gate is left. */
export function seedAfterAB(ideaId = "acme-docs-20261001-five-minutes"): Record<string, string> {
  const entry = (gate: "no-ai-slop" | "humanizer", order: 1 | 2) => ({
    gate,
    order,
    attempt: 1,
    result: "pass",
    findings: [],
    questions: [],
    jobId: 1,
    at: "2026-10-02T00:00:00.000Z",
    textBefore: `sha256:${"a".repeat(64)}`,
    textAfter: `sha256:${"a".repeat(64)}`,
  });
  const files = seedPieces(ideaId, {
    gates: { slop: "pass", humanizer: "pass", facts: "pending", platform: "pending" },
  });
  for (const platform of PLATFORMS) {
    files[contentPaths.gates(ideaId, platform)] =
      `${JSON.stringify([entry("no-ai-slop", 1), entry("humanizer", 2)], null, 2)}\n`;
  }
  return files;
}

/**
 * Runs queued jobs through the real runner with the production chain hook (the next step is
 * queued by the transaction that finishes each job) until none is left.
 */
export async function runChain(
  s: ReturnType<typeof contentSetup>,
  maxJobs = 12,
): Promise<number[]> {
  s.deps.afterOk = chainHook({
    db: s.deps.db,
    root: s.brain.root,
    timeZone: "Europe/London",
    dailyRuns: 1,
    now: () => new Date(),
  });
  const ran: number[] = [];
  for (let i = 0; i < maxJobs; i++) {
    const job = claimNextJob(s.deps.db);
    if (!job) break;
    await runAgentJob(s.deps, job);
    ran.push(job.id);
  }
  return ran;
}
