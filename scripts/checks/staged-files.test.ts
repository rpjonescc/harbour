import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPrivateData } from "./private-data";
import { readStagedFiles } from "./staged-files";

describe("readStagedFiles", () => {
  it("checks staged bytes even after the working file changes or disappears", () => {
    const root = mkdtempSync(join(tmpdir(), "harbour-staged-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    try {
      git("init", "-q");
      const token = "ghp_" + "a".repeat(36);
      writeFileSync(join(root, "one.ts"), `const key = "${token}";\n`);
      writeFileSync(join(root, "two.ts"), `const key = "${token}";\n`);
      git("add", "one.ts", "two.ts");
      writeFileSync(join(root, "one.ts"), "const key = 'clean';\n");
      unlinkSync(join(root, "two.ts"));

      const files = readStagedFiles(root);
      expect(files.map((file) => file.path).sort()).toEqual(["one.ts", "two.ts"]);
      expect(files.flatMap((file) => findPrivateData(file, []))).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
