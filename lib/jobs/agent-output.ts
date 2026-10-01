// Reads and imports what an agent run wrote for Harbour. Worker only.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { importProposals, parseProposals } from "@/lib/agents/proposals";
import type { AgentSpec } from "@/lib/agents/specs";
import { importWeeklyActions, parseWeeklyProposals } from "@/lib/analyst/proposals";
import type { Db } from "@/lib/db/client";
import type { Product } from "@/lib/products/catalog";
import { JobFailure } from "./agent-gate";
import type { Job } from "./queue";

const LIMITS = {
  discovery: { bytes: 1024 * 1024, label: "1 MiB" },
  weekly: { bytes: 256 * 1024, label: "256 KiB" },
} as const;

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

/** Reads, size-checks (discovery 1 MiB, weekly 256 KiB), parses and imports a run's output file. */
export function importAgentOutput(
  db: Db,
  root: string,
  spec: AgentSpec,
  job: Job,
  products: readonly Product[],
  now: Date,
): string | null {
  const output = spec.output;
  if (!output) return null;
  const file = join(root, output.path);
  const limit = LIMITS[output.kind];
  const { size } = statSync(file);
  if (size > limit.bytes) {
    throw new JobFailure(
      `${output.path} is too large (${size} bytes; the limit is ${limit.label})`,
    );
  }
  const text = readFileSync(file, "utf8");
  if (output.kind === "discovery") {
    const data = parsed(() => parseProposals(text));
    const productId = job.params.productId ?? "";
    const { added, skipped } = importProposals(db, productId, data, job.id, now);
    return `Imported ${added} proposal(s); ${skipped} already known`;
  }
  const ids = products.map((p) => p.id);
  const data = parsed(() => parseWeeklyProposals(text, ids));
  const { added, skipped } = importWeeklyActions(db, data, job.id, now);
  return `Imported ${added} action(s); ${skipped} already known`;
}
