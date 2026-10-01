/**
 * Git variables that point git at a specific repository. Git sets some of them for hooks, so a
 * test run from a pre-push hook would otherwise make scratch-repo commands (e.g. `git init
 * --bare`) act on the real repository.
 */
const REPO_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
];

/** Removes repository-selecting git variables from `env` in place. */
export function scrubGitEnv(env: Record<string, string | undefined>): void {
  for (const name of REPO_VARS) delete env[name];
}
