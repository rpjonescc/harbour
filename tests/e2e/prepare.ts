// Runs before Playwright: a fresh E2E database directory and a git-backed copy of the fixture
// brain with a bare remote, so the worker can commit and push agent output.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const DATA = "./data/e2e"; // E2E database and its quarantine (kept apart from the live service)
const BRAIN = "./data/e2e-brain";
const REMOTE = "./data/e2e-brain-remote.git";
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });

rmSync(DATA, { recursive: true, force: true });
rmSync(BRAIN, { recursive: true, force: true });
rmSync(REMOTE, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
cpSync("./tests/fixtures/brain", BRAIN, { recursive: true });
git(".", "init", "-q", "--bare", "-b", "main", REMOTE);
git(BRAIN, "init", "-q", "-b", "main");
git(BRAIN, "config", "user.name", "E2E Owner");
git(BRAIN, "config", "user.email", "owner@example.com");
git(BRAIN, "add", "-A");
git(BRAIN, "commit", "-q", "-m", "fixture");
git(BRAIN, "remote", "add", "origin", "../e2e-brain-remote.git");
git(BRAIN, "push", "-q", "-u", "origin", "main");
