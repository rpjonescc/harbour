import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Which brain changes an agent made. The agent can only write through Claude Code's file tools,
 * and every such call is in its stream before it runs, so the run's touched paths are known.
 * Anything else that changed during the run is the owner's, editing the brain at the same time.
 */

/** Paths (brain-relative, posix) the agent wrote, or "all" when that is not known. */
export type Touched = ReadonlySet<string> | "all";

/** A touched path that resolves outside the brain: always a rejected agent change. */
export const OUTSIDE_BRAIN = "<outside the brain>";

/** A write whose target is unknown (e.g. a malformed tool call): every change is the agent's. */
export const UNKNOWN_TOUCH = "*";

/** Resolves a path through its deepest existing ancestor (symlinks followed), keeping the rest. */
function realPath(path: string): string {
  const rest: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync(current), ...rest);
    } catch {
      const parent = dirname(current);
      if (parent === current) return path; // nothing on the way exists (not even "/")
      rest.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * The git path a tool's `file_path` writes to: resolved against `root`, through symlinked
 * directories, relative to the real root. OUTSIDE_BRAIN for anything outside it (or the root).
 */
export function brainRelativePath(root: string, filePath: string): string {
  const realRoot = realpathSync(root);
  const rel = relative(realRoot, realPath(resolve(root, filePath)));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return OUTSIDE_BRAIN;
  return rel.split(sep).join("/");
}

/**
 * A change is the agent's when it touched the path or either half of a rename. A directory
 * entry (`dir/`, e.g. a nested repo git cannot see into) is the agent's if it wrote inside.
 */
export function isAgentChange(change: { path: string; pair?: string }, touched: Touched): boolean {
  if (touched === "all") return true;
  if (touched.has(change.path)) return true;
  if (change.pair !== undefined && touched.has(change.pair)) return true;
  if (!change.path.endsWith("/")) return false;
  for (const path of touched) if (path.startsWith(change.path)) return true;
  return false;
}
