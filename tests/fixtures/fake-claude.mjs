#!/usr/bin/env node
// Fake `claude -p` for tests and E2E. Behaviour chosen by FAKE_CLAUDE_SCENARIO.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? "success";
const prompt = process.argv[process.argv.indexOf("-p") + 1] ?? "";
const targets = (/^TARGET_FILES:\s*(.+)$/m.exec(prompt)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Dated like a real run: the prompt's "Today's date:" line (a refresh must move it forward).
const today = /^Today's date:\s*(\d{4}-\d{2}-\d{2})$/m.exec(prompt)?.[1] ?? "2026-10-01";
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

// Each weekly run writes something new, as a real analyst run would: a rerun in the same week
// with byte-identical files would change nothing and fail as a run that wrote nothing.
const runAt = new Date().toISOString();

const weeklyProposals = (productId) => ({
  actions: [
    {
      productId,
      area: "GEO",
      title: "Answer the top buyer question on the home page",
      why: "AI assistants quote pages that answer the question directly.",
      fix: "Add a two-sentence answer near the top of the home page.",
      check: "The home page answers the question in its first paragraph.",
      impact: "high",
      effort: "small",
      evidence: [
        {
          url: "https://docs.example.com/",
          note: `No direct answer on the home page (checked ${runAt})`,
        },
      ],
      docs: ["research/geo/how-ai-engines-pick-sources.md"],
    },
  ],
});

// The daily note: the fake reads the fenced facts JSON from the prompt, as the real agent would,
// and writes a note that is honest about them. note-bad invents a figure; note-retry does so only
// until the checker's reason is fed back (the retry prompt carries it).
const noteFacts = () => {
  const match = /^(`{3,})json\n([\s\S]*?)\n\1$/m.exec(prompt);
  return match ? JSON.parse(match[2]) : {};
};
const noteText = (facts, bad) => {
  const name = facts.ownerFirstName ? `, ${facts.ownerFirstName}` : "";
  const trouble = (facts.trouble ?? []).length > 0;
  const body = bad
    ? "Your score jumped to 93 overnight and everything is wonderful."
    : trouble
      ? "Nothing here is shouting for you. A good place to start is the first item on your list."
      : "Nothing here is shouting for you. Pick whichever job on your list looks friendliest.";
  const lines = [
    "---",
    `greeting: "Morning${name}."`,
    'headline: "A quiet one, in a good way."',
    'mood: "steady"',
    "picks: []",
  ];
  if (facts.rest) lines.push('rest: "Everything here can wait until the next working day."');
  return [...lines, "---", body, ""].join("\n");
};

// Like Claude Code's Write tool: an existing file the session has not Read is not overwritten
// (the daily-note run has no Read tool, so a second attempt must write a fresh path).
function write(rel, content) {
  const abs = join(process.cwd(), rel);
  if (rel.startsWith("notes/daily/") && existsSync(abs)) {
    tool("Write", { file_path: abs });
    return;
  }
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
      if (/^notes\/daily\/.+\.md$/.test(rel)) {
        const retried = prompt.includes("was rejected by Harbour's checker");
        const bad = scenario === "note-bad" || (scenario === "note-retry" && !retried);
        const text = noteText(noteFacts(), bad);
        // The agent's own words stream too: a run record must not keep them for a note.
        out({ type: "assistant", message: { content: [{ type: "text", text }] } });
        write(rel, text);
      } else if (/^reports\/weekly\/.+\.proposals\.json$/.test(rel)) {
        const productId = scenario === "bad-weekly" ? "ghost-product" : "acme-docs";
        write(rel, JSON.stringify(weeklyProposals(productId), null, 2));
      } else if (rel.endsWith(".md") && scenario === "no-report") {
        // Skips the report: a half-done run.
      } else if (/^reports\/weekly\/.+\.md$/.test(rel)) {
        write(
          rel,
          `---\ntitle: Fake ${rel}\nresearched: ${today}\nconfidence: low\n---\n# Fake ${rel}\n\nWritten by the fake CLI at ${runAt}.\n`,
        );
      } else if (rel.endsWith("proposals.json")) {
        write(rel, scenario === "bad-json" ? "{ nope" : JSON.stringify(sampleProposals, null, 2));
      } else {
        write(
          rel,
          `---\ntitle: Fake ${rel}\nresearched: ${today}\nconfidence: low\n---\n# Fake ${rel}\n\nWritten by the fake CLI.\n`,
        );
      }
    }
    if (scenario === "escape") write("outside.md", "# Not allowed\n");
    // Claude Code denies writes outside the brain, but the attempt is still in the stream.
    if (scenario === "outside-attempt") tool("Write", { file_path: "/etc/harbour-denied.md" });
    // Claude Code's permissions would refuse this; the fake does it to exercise the git gate.
    if (scenario === "tamper-git") appendFileSync(".git/config", "[core]\n\tpager = evil\n");
    if (scenario === "tamper-head") writeFileSync(".git/HEAD", "garbage\n");
  }
  out({ type: "result", subtype: "success", is_error: false, result: "done" });
}
