import {
  brainRelativePath,
  isOutsideBrain,
  type Touched,
  UNKNOWN_TOUCH,
} from "@/lib/agents/attribution";
import { inspectRun, type RunSnapshot } from "@/lib/agents/brain-git";
import type { AgentSpec } from "@/lib/agents/specs";
import type { TouchedLog } from "./touched-log";

/** An expected, owner-readable failure (as opposed to a crash, which is also logged). */
export class JobFailure extends Error {}

// Ignored files editors rewrite on their own; changes to these never fail a run.
const BENIGN_TAMPER = [/(^|\/)\.DS_Store$/, /^\.obsidian\/workspace(-mobile)?\.json$/];

const listed = (paths: string[], max = 10) =>
  paths.length > max
    ? `${paths.slice(0, max).join(", ")} and ${paths.length - max} more`
    : paths.join(", ");

/**
 * The git gate: returns the paths to commit, or throws when the agent touched anything else.
 * Changes the agent did not write are the owner's: left in place, uncommitted, and noted.
 * A quiet run's messages carry counts only: the agent chooses file names, and a name can hold
 * screen text.
 */
export function gatedPaths(
  root: string,
  snapshot: RunSnapshot,
  spec: AgentSpec,
  touched: Touched,
  note: (text: string) => void,
  quiet = false,
): string[] {
  const inspection = inspectRun(root, snapshot, spec.allowed, touched);
  if (inspection.owner.length > 0) {
    const owner = inspection.owner.map((c) => c.path).sort();
    note(`Left ${owner.length} owner change(s) in place${quiet ? "" : `: ${listed(owner)}`}`);
  }
  if (inspection.gitTampered.length > 0) {
    const what = quiet
      ? `${inspection.gitTampered.length} item(s)`
      : inspection.gitTampered.join(", ");
    throw new JobFailure(`Agent changed git metadata: ${what}`);
  }
  const tampered = inspection.tampered.filter((p) => !BENIGN_TAMPER.some((re) => re.test(p)));
  if (tampered.length > 0) {
    const what = quiet ? `${tampered.length} file(s)` : tampered.join(", ");
    throw new JobFailure(`Agent changed ignored files: ${what}`);
  }
  if (inspection.rejected.length > 0) {
    const paths = quiet
      ? `${inspection.rejected.length} file(s)`
      : inspection.rejected.map((c) => c.path).join(", ");
    throw new JobFailure(`Agent changed files outside its area: ${paths}`);
  }
  if (inspection.allowed.length === 0)
    throw new JobFailure("Agent finished without writing anything");
  return inspection.allowed.map((c) => c.path);
}

/** Records the brain path of each file the agent is about to write; unresolvable → unknown. */
export function recordTouched(
  root: string,
  log: TouchedLog,
  raw: string,
  note: (text: string) => void,
  quiet = false,
) {
  let path: string;
  try {
    path = raw === UNKNOWN_TOUCH ? UNKNOWN_TOUCH : brainRelativePath(root, raw);
  } catch (error) {
    // A quiet run's target is the agent's choice and may hold screen text: log no part of it.
    if (quiet) console.error("could not resolve an agent write target");
    else console.error(`could not resolve agent write target ${raw}`, error);
    path = UNKNOWN_TOUCH;
  }
  if (isOutsideBrain(path)) {
    note(
      quiet
        ? "Agent tried to write outside the brain"
        : `Agent tried to write outside the brain: ${path}`,
    );
  }
  log.record(path);
}
