import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentRuns, costs } from "@/lib/db/schema";
import { checkNote } from "@/lib/explain/voice/check";
import { parseNoteFile } from "@/lib/note/file";
import { NOTE_PROMPT_VERSION } from "@/lib/note/prompt";
import { FACTS, TROUBLE_FACTS, WEEKEND_FACTS } from "@/tests/helpers/note";
import { runOne, setup } from "@/tests/helpers/run-job";
import { eventsSince } from "./queue";

const STAMP = "2026-10-02-0630";
const PATH = `notes/daily/${STAMP}.md`;
const PARAMS = { stamp: STAMP };

/** The fake CLI with the daily-note facts wired in; records every prompt and tool list it is run with. */
function noteSetup(scenario: string, facts: typeof FACTS | null = FACTS) {
  const s = setup(scenario, {}, facts ? { noteFacts: () => facts } : {});
  const calls: { prompt: string; tools: string }[] = [];
  const run = s.deps.run;
  s.deps.run = (options) => {
    calls.push({
      prompt: options.args[options.args.indexOf("-p") + 1] ?? "",
      tools: options.args[options.args.indexOf("--tools") + 1] ?? "",
    });
    return run(options);
  };
  return { ...s, calls };
}

describe("runAgentJob for the daily note", () => {
  it("commits a valid note through the git gate, with Write as the only tool and no cost row", async () => {
    const { brain, db, deps, calls } = noteSetup("note-ok");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job).toMatchObject({ status: "ok", error: null });
      expect(brain.git("log", "-1", "--format=%s").trim()).toBe(
        "agent(daily-note): 2026-10-02 06:30",
      );
      expect(brain.git("show", "--name-only", "--format=", "HEAD").trim()).toBe(PATH);
      expect(db.select().from(agentRuns).get()).toMatchObject({
        promptVersion: NOTE_PROMPT_VERSION,
      });
      // Agents run on the subscription: the cost ledger holds paid API calls only.
      expect(db.select().from(costs).all()).toEqual([]);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.tools).toBe("Write");
      expect(calls[0]?.prompt.split("\n")[0]).toBe(`TARGET_FILES: ${PATH}`);
      // The committed file is what the web process will read, and it passes the real checker.
      const parsed = parseNoteFile(readFileSync(join(brain.root, PATH), "utf8"));
      expect(parsed.ok && checkNote(parsed.note, FACTS)).toBeNull();
      expect(eventsSince(db, job.id, 0).map((e) => e.text)).toContain("Committed 1 file(s)");
    } finally {
      brain.cleanup();
    }
  });

  it("writes a rest sentence on a weekend and a next step when there is trouble", async () => {
    for (const facts of [WEEKEND_FACTS, TROUBLE_FACTS]) {
      const { brain, deps } = noteSetup("note-ok", facts);
      try {
        expect(await runOne(deps, "daily-note", PARAMS)).toMatchObject({ status: "ok" });
        const text = readFileSync(join(brain.root, PATH), "utf8");
        expect(/^rest:/m.test(text)).toBe(facts.rest !== null);
      } finally {
        brain.cleanup();
      }
    }
  });

  it("retries once with the checker's reason, in the same job, and commits the corrected note", async () => {
    const { brain, db, deps, calls } = noteSetup("note-retry");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job.status).toBe("ok");
      expect(calls).toHaveLength(2);
      expect(calls[1]?.prompt).toContain(
        "was rejected by Harbour's checker: The note uses the figure 93, which is not in the facts.",
      );
      expect(calls[1]?.prompt.startsWith(calls[0]?.prompt ?? "?")).toBe(true);
      const texts = eventsSince(db, job.id, 0).map((e) => e.text);
      expect(texts.some((t) => /rejected the output .*asking the agent once more/.test(t))).toBe(
        true,
      );
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(2);
    } finally {
      brain.cleanup();
    }
  });

  it("fails after the second rejection, with the reason, committing and showing nothing", async () => {
    const { brain, deps, calls } = noteSetup("note-bad");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(calls).toHaveLength(2); // never a third try
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/output was rejected: The note uses the figure 93/);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });

  it("does not retry a CLI failure: that is not a rejected note", async () => {
    const { brain, deps, calls } = noteSetup("fail");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job).toMatchObject({ status: "failed", error: "Agent failed: Not logged in" });
      expect(calls).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("fails without running the agent when the facts are unavailable or the stamp is malformed", async () => {
    const noFacts = noteSetup("note-ok", null);
    try {
      const job = await runOne(noFacts.deps, "daily-note", PARAMS);
      expect(job.error).toMatch(/facts are not available/);
      expect(noFacts.calls).toHaveLength(0);
    } finally {
      noFacts.brain.cleanup();
    }
    const bad = noteSetup("note-ok");
    try {
      const job = await runOne(bad.deps, "daily-note", { stamp: "2026-10-02" });
      expect(job.error).toMatch(/Invalid note stamp/);
      expect(bad.calls).toHaveLength(0);
    } finally {
      bad.brain.cleanup();
    }
  });
});
