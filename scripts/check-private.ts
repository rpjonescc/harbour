import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { findPrivateData, type PrivateFinding, parseTerms } from "./checks/private-data";
import { parsePushRanges, type RevRange, scanCommits } from "./checks/pushed-commits";
import { readStagedFiles } from "./checks/staged-files";

const TERMS_FILE = ".private-terms";
const pushing = process.argv.includes("--commits");
const requireTerms = pushing || process.argv.includes("--require-terms");

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
  const worktreeFiles = git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter((path) => path.length > 0 && existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, "utf8") }))
    .filter((file) => !file.content.includes("\0"));
  return [...readStagedFiles(), ...worktreeFiles].flatMap((file) => findPrivateData(file, terms));
}

/** Ranges from the pre-push hook's stdin, or every commit not yet on origin/main. */
function pushRanges(): RevRange[] {
  const stdin = process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  return parsePushRanges(stdin) ?? [[hasRef("origin/main") ? "origin/main..HEAD" : "HEAD"]];
}

const terms = existsSync(TERMS_FILE) ? parseTerms(readFileSync(TERMS_FILE, "utf8")) : [];
if (terms.length === 0) {
  if (requireTerms && process.env.HARBOUR_ALLOW_NO_PRIVATE_TERMS !== "1") {
    console.error(
      `error: no owner terms in ${TERMS_FILE} — copy .private-terms.example and list your own names, ` +
        "emails and products (or set HARBOUR_ALLOW_NO_PRIVATE_TERMS=1 to skip deliberately)",
    );
    process.exit(1);
  }
  console.warn(
    `note: no ${TERMS_FILE} — only secret patterns are checked (see .private-terms.example)`,
  );
}
const findings = [...scanFiles(terms), ...(pushing ? scanCommits(pushRanges(), terms) : [])];
for (const f of findings)
  console.error(`error ${f.path}:${f.line}: ${f.label} — remove before committing`);
if (findings.length > 0) process.exit(1);
console.log(`private data ok (${terms.length} owner terms checked)`);
