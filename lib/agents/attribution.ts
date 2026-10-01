import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Which brain changes an agent made. The agent can only write through Claude Code's file tools,
 * and every such call is in its stream before it runs, so the run's touched paths are known.
 * Anything else that changed during the run is the owner's, editing the brain at the same time.
 */

/** Paths (brain-relative, posix) the agent wrote, or "all" when that is not known. */
export type Touched = ReadonlySet<string> | "all";

/** Prefix of a touched path outside the brain (followed by the attempted path): rejected. */
export const OUTSIDE_BRAIN = "<outside the brain>";

/** A write whose target is unknown (e.g. a malformed tool call): every change is the agent's. */
export const UNKNOWN_TOUCH = "*";

const MAX_ATTEMPT_CHARS = 200;

/** True for a touched path recording an attempted write outside the brain. */
export function isOutsideBrain(path: string): boolean {
  return path.startsWith(OUTSIDE_BRAIN);
}

function outsideBrain(filePath: string): string {
  const shown =
    filePath.length > MAX_ATTEMPT_CHARS ? `${filePath.slice(0, MAX_ATTEMPT_CHARS)}…` : filePath;
  return `${OUTSIDE_BRAIN}: ${shown}`;
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Resolves a path through its deepest existing ancestor (symlinks followed), keeping the rest. */
function realPath(path: string): string {
  const rest: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...rest);
    } catch {
      const parent = dirname(current);
      if (parent === current) return path; // nothing on the way exists (not even "/")
      rest.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * The git path a tool's absolute `file_path` writes to: through symlinked directories, relative
 * to the real root; OUTSIDE_BRAIN plus the path for anything outside it (or the root itself).
 * UNKNOWN_TOUCH when the target is ambiguous: a non-absolute path (the tool may expand `~` or
 * use another base), a symlink as the file itself (the write lands at its target, which may not
 * exist yet), or a path that is not NFC-normalised (it may name a different file in git).
 */
export function brainRelativePath(root: string, filePath: string): string {
  if (!isAbsolute(filePath) || filePath !== filePath.normalize("NFC")) return UNKNOWN_TOUCH;
  const absolute = resolve(filePath);
  if (isSymlink(absolute)) return UNKNOWN_TOUCH;
  const realRoot = realpathSync.native(root);
  const rel = relative(realRoot, realPath(absolute));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return outsideBrain(filePath);
  }
  return rel.split(sep).join("/");
}

/**
 * A change is the agent's when it touched the path or either half of a rename. A directory
 * entry (`dir/`, a nested repo git cannot see into) or a gitlink (`dir`) is the agent's if it
 * wrote inside.
 */
export function isAgentChange(change: { path: string; pair?: string }, touched: Touched): boolean {
  if (touched === "all") return true;
  if (touched.has(change.path)) return true;
  if (change.pair !== undefined && touched.has(change.pair)) return true;
  const dir = change.path.endsWith("/") ? change.path : `${change.path}/`;
  for (const path of touched) if (path.startsWith(dir)) return true;
  return false;
}
