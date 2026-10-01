import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { findPrivateData, type PrivateFinding, parseTerms } from "./checks/private-data";

const TERMS_FILE = ".private-terms";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function hasRef(ref: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

function scanFiles(terms: string[]): PrivateFinding[] {
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter((path) => path.length > 0 && existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, "utf8") }))
    .filter((file) => !file.content.includes("\0"))
    .flatMap((file) => findPrivateData(file, terms));
}

function scanUnpushedCommits(terms: string[]): PrivateFinding[] {
  const range = hasRef("origin/main") ? "origin/main..HEAD" : "HEAD";
  return git(["log", "--format=%h%x00%an <%ae>%n%B%x1e", range])
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      const [sha = "?", content = ""] = entry.split("\0");
      return findPrivateData({ path: `commit ${sha}`, content }, terms);
    });
}

const terms = existsSync(TERMS_FILE) ? parseTerms(readFileSync(TERMS_FILE, "utf8")) : [];
if (terms.length === 0) {
  console.warn(
    `note: no ${TERMS_FILE} — only secret patterns are checked (see .private-terms.example)`,
  );
}
const findings = [
  ...scanFiles(terms),
  ...(process.argv.includes("--commits") ? scanUnpushedCommits(terms) : []),
];
for (const f of findings)
  console.error(`error ${f.path}:${f.line}: ${f.label} — remove before committing`);
if (findings.length > 0) process.exit(1);
console.log(`private data ok (${terms.length} owner terms checked)`);
