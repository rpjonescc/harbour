import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

const GIT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024;

function realOrResolved(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * `GIT_OPTIONAL_LOCKS=0` keeps read-only calls (status, polled by the web every few seconds)
 * from taking `index.lock`, which would make the owner's own git commands fail at random.
 * `pinned` fixes git to `<root>/.git` with `root` as the work tree, and stops discovery above
 * `root`: a broken or missing `.git` fails loudly instead of falling through to an enclosing
 * repository.
 */
function gitEnv(root: string, pinned: boolean): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
  if (!pinned) return env;
  const real = realOrResolved(root);
  return {
    ...env,
    GIT_DIR: posix.join(real, ".git"),
    GIT_WORK_TREE: real,
    GIT_CEILING_DIRECTORIES: dirname(real),
  };
}

/**
 * Every gate git call is hardened: pinned to the brain repository, literal pathspecs (file names
 * are never magic), no fsmonitor or hook execution from repo config, no system config, no prompts.
 */
export function git(root: string, args: string[], pinned = true): string {
  return execFileSync(
    "git",
    [
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: gitEnv(root, pinned) as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
