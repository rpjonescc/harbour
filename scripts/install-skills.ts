import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getConfig } from "@/lib/config";

const REPO = "https://github.com/rpjonescc/harbour";

/** The SOURCE line the other installed skills have: where it came from, at which commit, when. */
export function sourceLine(sha: string, date: string): string {
  return `Source: ${REPO} (skills/atomizer) @ ${sha} (installed ${date})\n`;
}

/** Replaces `<to>/atomizer` with a copy of `from` and a SOURCE file (no stale files stay behind). */
export function installSkills(input: { from: string; to: string; source: string }): void {
  const target = join(input.to, "atomizer");
  // Deleting the target first would delete the source when they are the same folder.
  if (resolve(input.from) === resolve(target)) {
    throw new Error(
      "The skills folder is the atomizer source itself; choose another HARBOUR_SKILLS_DIR.",
    );
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(input.to, { recursive: true });
  cpSync(input.from, target, { recursive: true });
  writeFileSync(join(target, "SOURCE"), input.source);
}

function main() {
  const dir = getConfig().HARBOUR_SKILLS_DIR;
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
  const date = new Date().toISOString().slice(0, 10);
  installSkills({
    from: "skills/atomizer",
    to: dir,
    source: sourceLine(dirty ? `${sha}-dirty` : sha, date),
  });
  console.log(`installed the atomizer skill in ${join(dir, "atomizer")} (${sha})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
