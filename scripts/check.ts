import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { checkFileSizes, type SourceFile } from "./checks/file-size";
import { findHexColors } from "./checks/hex-colors";

function trackedFiles(): SourceFile[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return output
    .split("\n")
    .filter((path) => path.length > 0 && existsSync(path))
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

const files = trackedFiles();
const sizes = checkFileSizes(files);
const colours = files.flatMap(findHexColors);

for (const w of sizes.warnings) {
  console.warn(
    `warn  ${w.path}: ${w.lines} lines (soft limit ${w.limit} for ${w.label}) — consider splitting`,
  );
}
for (const e of sizes.errors) {
  console.error(
    `error ${e.path}: ${e.lines} lines (hard limit ${e.limit} for ${e.label}) — split this file`,
  );
}
for (const c of colours) {
  console.error(`error ${c.path}:${c.line}: hardcoded colour ${c.match} — use a semantic token`);
}

if (sizes.errors.length > 0 || colours.length > 0) process.exit(1);
console.log(`files ok (${files.length} checked, ${sizes.warnings.length} soft warnings)`);
