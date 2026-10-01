#!/usr/bin/env node
// Fake `claude -p` for tests and E2E. Behaviour chosen by FAKE_CLAUDE_SCENARIO.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "success";
const prompt = process.argv[process.argv.indexOf("-p") + 1] ?? "";
const targets = (/^TARGET_FILES:\s*(.+)$/m.exec(prompt)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const tool = (name, input) =>
  out({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });

const sampleProposals = {
  keywords: [{ term: "example widgets", intent: "commercial", why: "Core product term" }],
  questions: [{ text: "What is the best example widget?", why: "Common buyer question" }],
  competitors: [
    { name: "Example Rival", url: "https://rival.example.com", why: "Ranks for core terms" },
  ],
};

function write(rel, content) {
  const abs = join(process.cwd(), rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  tool("Write", { file_path: abs });
}

out({ type: "system", subtype: "init", tools: ["Read", "Write"] });
if (scenario === "spawn-grandchild" || scenario === "spawn-grandchild-ignore") {
  // Grandchild inherits our process group (not detached); its PID is written for the test.
  const args =
    scenario === "spawn-grandchild"
      ? ["sleep", ["60"]]
      : [process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]];
  const grandchild = spawn(args[0], args[1], { stdio: "ignore" });
  writeFileSync(join(process.cwd(), "grandchild.pid"), String(grandchild.pid));
  setInterval(() => {}, 1000);
} else if (scenario === "slow") {
  setTimeout(
    () => out({ type: "result", subtype: "success", is_error: false, result: "late" }),
    60_000,
  );
} else if (scenario === "fail") {
  out({ type: "result", subtype: "success", is_error: true, result: "Not logged in" });
} else {
  tool("WebSearch", { query: "fake research query" });
  if (scenario !== "noop") {
    for (const rel of targets) {
      if (rel.endsWith("proposals.json")) {
        write(rel, scenario === "bad-json" ? "{ nope" : JSON.stringify(sampleProposals, null, 2));
      } else {
        write(
          rel,
          `---\ntitle: Fake ${rel}\nresearched: 2026-10-01\nconfidence: low\n---\n# Fake ${rel}\n\nWritten by the fake CLI.\n`,
        );
      }
    }
    if (scenario === "escape") write("outside.md", "# Not allowed\n");
    // Claude Code's permissions would refuse this; the fake does it to exercise the git gate.
    if (scenario === "tamper-git") appendFileSync(".git/config", "[core]\n\tpager = evil\n");
    if (scenario === "tamper-head") writeFileSync(".git/HEAD", "garbage\n");
  }
  out({ type: "result", subtype: "success", is_error: false, result: "done" });
}
