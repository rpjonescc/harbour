// Reads, validates and imports what an agent run wrote for Harbour. Worker only.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { importProposals, type Proposals, parseProposals } from "@/lib/agents/proposals";
import type { AgentOutput, AgentSpec } from "@/lib/agents/specs";
import {
  importWeeklyActions,
  parseWeeklyProposals,
  type WeeklyProposals,
} from "@/lib/analyst/proposals";
import type { Db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import type { Product } from "@/lib/products/catalog";
import { JobFailure } from "./agent-gate";
import type { Job } from "./queue";

const LIMITS = {
  discovery: { bytes: 1024 * 1024, label: "1 MiB" },
  weekly: { bytes: 256 * 1024, label: "256 KiB" },
} as const;

/** A run's output file, validated and ready to import. */
export type ParsedOutput =
  | { kind: "discovery"; data: Proposals }
  | { kind: "weekly"; data: WeeklyProposals };

/** An output file's size, and its text (read only when the size is within the limit). */
export type OutputFile = { size: number; read: () => string };

/** Throws unless the run wrote every file its spec requires (checked before anything is committed). */
export function checkRequiredOutputs(spec: AgentSpec, paths: readonly string[]): void {
  const missing = spec.requiredOutputs.find((path) => !paths.includes(path));
  if (missing !== undefined) throw new JobFailure(`Agent did not write ${missing}`);
}

/** Validation errors are the agent's mistakes: a readable job failure, not a crash. */
function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new JobFailure((error as Error).message);
  }
}

/** Size-checks (discovery 1 MiB, weekly 256 KiB) and validates an output file. */
export function parseAgentOutput(
  output: NonNullable<AgentOutput>,
  file: OutputFile,
  products: readonly Product[],
): ParsedOutput {
  const limit = LIMITS[output.kind];
  if (file.size > limit.bytes) {
    throw new JobFailure(
      `${output.path} is too large (${file.size} bytes; the limit is ${limit.label})`,
    );
  }
  const text = file.read();
  if (output.kind === "discovery")
    return { kind: "discovery", data: parsed(() => parseProposals(text)) };
  const ids = products.map((p) => p.id);
  return { kind: "weekly", data: parsed(() => parseWeeklyProposals(text, ids)) };
}

/** The run's output file in the working tree, validated before anything is committed. */
export function readAgentOutput(
  root: string,
  spec: AgentSpec,
  products: readonly Product[],
): ParsedOutput | null {
  const output = spec.output;
  if (!output) return null;
  const path = join(root, output.path);
  const file = { size: statSync(path).size, read: () => readFileSync(path, "utf8") };
  return parseAgentOutput(output, file, products);
}

/** Counts one import attempt for the run; returns the attempts so far. */
export function countImportAttempt(db: Db, jobId: number): number {
  const row = db
    .update(agentRuns)
    .set({ importAttempts: sql`${agentRuns.importAttempts} + 1` })
    .where(eq(agentRuns.jobId, jobId))
    .returning({ attempts: agentRuns.importAttempts })
    .get();
  return row?.attempts ?? 0;
}

/**
 * Imports a run's validated output in one short transaction that also marks the run imported:
 * a second call for the same job imports nothing and returns null. Returns the event text.
 */
export function importAgentOutput(
  db: Db,
  output: ParsedOutput,
  job: Job,
  now: Date,
): string | null {
  return db.transaction(
    (tx) => {
      const marked = tx
        .update(agentRuns)
        .set({ importedAt: now })
        .where(and(eq(agentRuns.jobId, job.id), isNull(agentRuns.importedAt)))
        .returning({ jobId: agentRuns.jobId })
        .all();
      if (marked.length === 0) return null; // already imported (or no run row)
      if (output.kind === "discovery") {
        const productId = job.params.productId ?? "";
        const { added, skipped } = importProposals(tx, productId, output.data, job.id, now);
        return `Imported ${added} proposal(s); ${skipped} already known`;
      }
      const { added, skipped } = importWeeklyActions(tx, output.data, job.id, now);
      return `Imported ${added} action(s); ${skipped} already known`;
    },
    { behavior: "immediate" },
  );
}

/**
 * The run's own import, after its commit. A failure is recorded on the job and left to the
 * import retry (the files are committed, so the run itself is kept).
 */
export function importAfterCommit(
  db: Db,
  output: ParsedOutput,
  job: Job,
  now: Date,
  event: (kind: "status" | "error", text: string) => void,
): void {
  try {
    // Inside the try: the run is committed, so no import failure may fail the job.
    countImportAttempt(db, job.id);
    const text = importAgentOutput(db, output, job, now);
    if (text) event("status", text);
  } catch (error) {
    console.error(`job ${job.id}: import failed`, error);
    event(
      "error",
      `Import failed — the files are committed and the import will be retried automatically: ${(error as Error).message}`,
    );
  }
}
