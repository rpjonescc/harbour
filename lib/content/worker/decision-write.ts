import {
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { git } from "@/lib/agents/git-command";
import { type Change, DecisionRefusal } from "./decision-types";

const TAKEN =
  "A file with this export name appeared while Harbour was saving, so it saved nothing. Try again.";

const exists = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

/** A new file that never replaces anything: written aside, then linked into place (EEXIST if taken). */
function createExclusive(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const aside = `${path}.${process.pid}.tmp`;
  writeFileSync(aside, text, { flag: "wx" });
  try {
    linkSync(aside, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new DecisionRefusal(TAKEN);
    throw error;
  } finally {
    rmSync(aside, { force: true });
  }
}

function replaceAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const aside = `${path}.${process.pid}.tmp`;
  writeFileSync(aside, text, { flag: "w" });
  renameSync(aside, path);
}

/** A file's text before the change, so a failed commit leaves the owner's files as they were. */
type Before = { path: string; text: string };

const beforeText = (root: string, paths: string[]): Before[] =>
  paths.map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));

/**
 * Puts a change on disk and returns the paths to commit and a way back. A file to remove that is
 * already gone is skipped. `undo` removes only the files this call created itself, so it can
 * never delete a file that someone else made first.
 */
export function applyChange(root: string, change: Change): { paths: string[]; undo: () => void } {
  const removals = change.remove.filter((p) => exists(join(root, p)));
  const replaced = Object.keys(change.write).filter((p) => exists(join(root, p)));
  const before = beforeText(root, [...replaced, ...removals]);
  const made: string[] = [];
  const paths = [...Object.keys(change.write), ...Object.keys(change.create), ...removals];
  const undo = () => {
    for (const path of made) rmSync(join(root, path), { force: true });
    for (const { path, text } of before) writeFileSync(join(root, path), text);
    try {
      git(root, ["reset", "-q", "--", ...paths]);
    } catch {
      // Best effort: the files are back as they were; an index entry left staged is harmless.
    }
  };
  try {
    for (const [path, text] of Object.entries(change.create)) {
      createExclusive(join(root, path), text);
      made.push(path);
    }
    for (const [path, text] of Object.entries(change.write)) {
      if (!replaced.includes(path)) made.push(path);
      replaceAtomic(join(root, path), text);
    }
    for (const path of removals) rmSync(join(root, path), { force: true });
  } catch (error) {
    undo();
    throw error;
  }
  return { paths, undo };
}
