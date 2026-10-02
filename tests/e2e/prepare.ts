// Runs before Playwright: a fresh E2E database directory and a git-backed copy of the fixture
// brain with a bare remote, so the worker can commit and push agent output.
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FIXTURE_SKILL_TEXT, VOICE_ACME } from "../helpers/content-fixtures";
import { E2E_WORKS } from "./content-fixtures";

// E2E database, its quarantine and its backups (kept apart from the live service). E2E leaves
// HARBOUR_BACKUP_DIR unset, so Back up now writes to `<folder of the database>/backups`, inside
// this folder: removing it below also removes the previous run's backups.
const DATA = "./data/e2e";
const BRAIN = "./data/e2e-brain";
const REMOTE = "./data/e2e-brain-remote.git";
const SKILLS = "./data/e2e-skills";
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });

rmSync(DATA, { recursive: true, force: true });
rmSync(BRAIN, { recursive: true, force: true });
rmSync(REMOTE, { recursive: true, force: true });
rmSync(SKILLS, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
cpSync("./tests/fixtures/brain", BRAIN, { recursive: true });

// Content machine: a voice profile, a fact the pieces may state, fixture skills (tiny fictional
// text, never the owner's real skills) and the fake CLI's replay file. No idea or digest is
// seeded: the content spec makes them through the page, as the owner would.
const put = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
put(BRAIN, "content/voices/acme-docs.md", VOICE_ACME);
appendFileSync(
  join(BRAIN, "products/acme-docs/notes.md"),
  "\nA first deploy takes about five minutes.\n",
);
for (const [path, text] of Object.entries(FIXTURE_SKILL_TEXT)) put(SKILLS, path, text);
put("./tests/fixtures", "content/chain-works.json", JSON.stringify(E2E_WORKS));

git(".", "init", "-q", "--bare", "-b", "main", REMOTE);
git(BRAIN, "init", "-q", "-b", "main");
git(BRAIN, "config", "user.name", "E2E Owner");
git(BRAIN, "config", "user.email", "owner@example.com");
git(BRAIN, "add", "-A");
git(BRAIN, "commit", "-q", "-m", "fixture");
git(BRAIN, "remote", "add", "origin", "../e2e-brain-remote.git");
git(BRAIN, "push", "-q", "-u", "origin", "main");
