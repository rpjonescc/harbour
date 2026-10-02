import { appendFileSync, rmSync } from "node:fs";
import { posix, resolve } from "node:path";
import { isAgentChange, type Touched } from "./attribution";
import {
  type Change,
  newIgnored,
  newNestedGit,
  type RunSnapshot,
  statusChanges,
} from "./brain-git";
import { prepareQuarantineDir, quarantine, restoreGitMetadata } from "./brain-git-fs";
import { git } from "./git-command";

const MAX_DISCARD_ROUNDS = 3;

function inHead(root: string, path: string): boolean {
  try {
    git(root, ["cat-file", "-e", `HEAD:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function revert(root: string, changes: Change[]): void {
  const tracked = changes.filter((c) => !c.untracked && inHead(root, c.path)).map((c) => c.path);
  const gone = changes.filter((c) => !tracked.includes(c.path)).map((c) => c.path);
  if (tracked.length)
    git(root, ["restore", "--staged", "--worktree", "--source=HEAD", "--", ...tracked]);
  if (gone.length) {
    git(root, ["rm", "-r", "-f", "-q", "--cached", "--ignore-unmatch", "--", ...gone]);
    git(root, ["clean", "-ffdxq", "--", ...gone]);
  }
}

/** The agent's changes still in the brain: touched status changes and new ignored files. */
function runChanges(root: string, snapshot: RunSnapshot, touched: Touched): Change[] {
  const changes = statusChanges(root).filter(
    (c) => !snapshot.ignored.has(c.path) && isAgentChange(c, touched),
  );
  const seen = new Set(changes.map((c) => c.path));
  return [...changes, ...newIgnored(root, snapshot, seen)];
}

/**
 * Throws the agent's changes away (all changes when `touched` is "all"; the owner's are left
 * as they are): tracked changes back to HEAD, unstaged, untracked and new ignored files
 * deleted, `.git/config` and `.git/info/*` restored. Before anything is touched, every changed
 * file's current content is copied to `quarantineDir` (outside the brain) with a MANIFEST.txt.
 * Snapshot entries are never deleted. Re-scans and throws if anything remains.
 */
export function discardRun(
  root: string,
  snapshot: RunSnapshot,
  quarantineDir: string,
  touched: Touched,
): { quarantined: string[] } {
  const dirAbs = prepareQuarantineDir(root, quarantineDir);
  const done = new Set<string>();
  const notes: string[] = [];
  const removeNestedGit = () => {
    const nested = newNestedGit(root, snapshot, [""]);
    quarantine(
      root,
      dirAbs,
      nested.map((path) => ({ path })),
      notes,
      done,
    );
    for (const path of nested) {
      notes.push(`${path}: nested .git removed`);
      rmSync(posix.join(root, path), { recursive: true, force: true });
    }
  };
  const flush = () => {
    if (!notes.length) return;
    appendFileSync(resolve(dirAbs, "MANIFEST.txt"), `${notes.join("\n")}\n`);
    notes.length = 0;
  };
  // Git metadata first, so the git commands below run against the owner's repository.
  restoreGitMetadata(root, snapshot.gitMeta, snapshot.gitRestore, notes);
  flush();
  let pending = runChanges(root, snapshot, touched);
  for (let round = 0; round < MAX_DISCARD_ROUNDS; round++) {
    quarantine(root, dirAbs, pending, notes, done);
    flush();
    removeNestedGit();
    restoreGitMetadata(root, snapshot.gitMeta, snapshot.gitRestore, notes);
    flush();
    if (pending.length) revert(root, pending);
    pending = runChanges(root, snapshot, touched);
    if (!pending.length && !newNestedGit(root, snapshot, [""]).length)
      return { quarantined: [...done] };
  }
  // Counts only, for the same reason: names stay in the quarantine's MANIFEST.txt.
  throw new Error(`could not restore ${pending.length} file(s)`);
}
