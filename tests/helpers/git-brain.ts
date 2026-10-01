import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBrain } from "./brain";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

/** A committed brain repo with a bare remote, for git-gate tests. */
export function makeGitBrain(files: Record<string, string>) {
  const brain = makeBrain({ "README.md": "# Brain\n", ...files });
  const remoteDir = mkdtempSync(join(tmpdir(), "harbour-remote-"));
  const remote = join(remoteDir, "brain.git");
  git(remoteDir, "init", "-q", "--bare", "-b", "main", remote);
  git(brain.root, "init", "-q", "-b", "main");
  git(brain.root, "config", "user.name", "Test Owner");
  git(brain.root, "config", "user.email", "owner@example.com");
  git(brain.root, "add", "-A");
  git(brain.root, "commit", "-q", "-m", "init");
  git(brain.root, "remote", "add", "origin", remote);
  git(brain.root, "push", "-q", "-u", "origin", "main");
  return {
    root: brain.root,
    remote,
    git: (...args: string[]) => git(brain.root, ...args),
    cleanup: () => {
      brain.cleanup();
      rmSync(remoteDir, { recursive: true, force: true });
    },
  };
}
