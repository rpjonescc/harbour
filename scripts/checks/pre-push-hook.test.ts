import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "..", "..");
const lefthook = join(repo, "node_modules", ".bin", "lefthook");
// Inside a real git hook, GIT_* variables point at the outer repository.
const env: NodeJS.ProcessEnv = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_") || key === "LEFTHOOK") delete env[key];
}

describe("pre-push hook (real lefthook, scratch clone, bare remote)", () => {
  it.skipIf(!existsSync(lefthook))(
    "rejects add-then-remove secrets, owner terms in messages and non-HEAD branch pushes",
    () => {
      // Throws (failing the test) with the script's output if any case misbehaves.
      const output = execFileSync("sh", [join(repo, "scripts", "test-pre-push.sh")], {
        env,
        encoding: "utf8",
      });
      expect(output).toContain("pre-push scan ok");
    },
    120_000,
  );
});
