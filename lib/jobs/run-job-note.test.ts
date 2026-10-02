import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentRuns, costs } from "@/lib/db/schema";
import { checkNote } from "@/lib/explain/voice/check";
import { noteDigest } from "@/lib/note/digest";
import { parseNoteFile } from "@/lib/note/file";
import { NOTE_PROMPT_VERSION } from "@/lib/note/prompt";
import { FACTS, TROUBLE_FACTS, WEEKEND_FACTS } from "@/tests/helpers/note";
import { runOne, setup } from "@/tests/helpers/run-job";
import { eventsSince } from "./queue";
import { touchedPath } from "./run-paths";

const STAMP = "2026-10-02-0630";
const PATH = `notes/daily/${STAMP}.md`;
const DRAFT = `notes/daily/${STAMP}.draft.md`;
const PARAMS = { stamp: STAMP };

/** The fake CLI with the daily-note facts wired in; records every prompt and tool list it is run with. */
function noteSetup(scenario: string, facts: typeof FACTS | null = FACTS) {
  const s = setup(scenario, {}, facts ? { noteFacts: () => facts } : {});
  const calls: { prompt: string; tools: string }[] = [];
  /** Whether the final note path existed after each attempt: it must never exist mid-job. */
  const publishedDuringRun: boolean[] = [];
  const run = s.deps.run;
  s.deps.run = async (options) => {
    calls.push({
      prompt: options.args[options.args.indexOf("-p") + 1] ?? "",
      tools: options.args[options.args.indexOf("--tools") + 1] ?? "",
    });
    const outcome = await run(options);
    publishedDuringRun.push(existsSync(join(s.brain.root, PATH)));
    return outcome;
  };
  return { ...s, calls, publishedDuringRun };
}

describe("runAgentJob for the daily note", () => {
  it("commits a valid note through the git gate, with Write as the only tool and no cost row", async () => {
    const { brain, db, deps, calls } = noteSetup("note-ok");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job).toMatchObject({ status: "ok", error: null });
      // The job records the digest of the exact bytes that passed the checker and were committed.
      expect(job.result).toBe(noteDigest(readFileSync(join(brain.root, PATH))));
      expect(job.result).toBe(noteDigest(brain.git("show", `HEAD:${PATH}`)));
      expect(brain.git("log", "-1", "--format=%s").trim()).toBe(
        "agent(daily-note): 2026-10-02 06:30",
      );
      expect(brain.git("show", "--name-only", "--format=", "HEAD").trim()).toBe(PATH);
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
      expect(db.select().from(agentRuns).get()).toMatchObject({
        promptVersion: NOTE_PROMPT_VERSION,
      });
      // Agents run on the subscription: the cost ledger holds paid API calls only.
      expect(db.select().from(costs).all()).toEqual([]);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.tools).toBe("Write");
      expect(calls[0]?.prompt.split("\n")[0]).toBe(`TARGET_FILES: ${DRAFT}`);
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
      // The corrected note replaced the rejected draft: the committed text has no invented figure.
      expect(readFileSync(join(brain.root, PATH), "utf8")).not.toContain("93");
    } finally {
      brain.cleanup();
    }
  });

  it("fails after the second rejection, with the reason, committing and showing nothing", async () => {
    const { brain, deps, calls, publishedDuringRun } = noteSetup("note-bad");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(calls).toHaveLength(2); // never a third try
      expect(job.status).toBe("failed");
      expect(job.error).toMatch(/output was rejected: The note uses the figure 93/);
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
      expect(brain.git("status", "--porcelain")).toBe("");
      // The rejected note was never at the path the web process reads, and nothing is left.
      expect(publishedDuringRun).toEqual([false, false]);
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
      expect(existsSync(join(brain.root, PATH))).toBe(false);
    } finally {
      brain.cleanup();
    }
  });

  it("does not retry a CLI failure: that is not a rejected note", async () => {
    const { brain, deps, calls } = noteSetup("fail");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job).toMatchObject({ status: "failed", error: "The note agent didn't finish." });
      expect(calls).toHaveLength(1);
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
      expect(existsSync(join(brain.root, PATH))).toBe(false);
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

  it("keeps the note's words and the first name out of the run record", async () => {
    const { brain, db, deps } = noteSetup("note-ok");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job.status).toBe("ok");
      const run = db.select().from(agentRuns).get();
      expect(run?.stdoutTail).toBe("(not recorded for the daily note)");
      expect(run?.stderrTail).toBe("(not recorded for the daily note)");
      const events = eventsSince(db, job.id, 0);
      expect(events.some((e) => e.kind === "text")).toBe(false);
      expect(JSON.stringify([run, events])).not.toContain("Sam");
      expect(events.map((e) => e.text)).toContain("Started Daily note: 2026-10-02 06:30");
      // No path the agent chose appears either: tool steps carry a fixed marker.
      expect(events.some((e) => e.text.includes("draft"))).toBe(false);
    } finally {
      brain.cleanup();
    }
  });

  it("keeps the agent's failure text, with its name and figures, out of the job row and events", async () => {
    const { brain, db, deps } = noteSetup("note-fail-text");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job).toMatchObject({ status: "failed", error: "The note agent didn't finish." });
      // Not the whole row: its timestamps are digits too.
      const record = JSON.stringify([
        job.error,
        job.result,
        eventsSince(db, job.id, 0).map((e) => e.text),
      ]);
      expect(record).not.toContain("Sam");
      expect(record).not.toContain("93");
    } finally {
      brain.cleanup();
    }
  });

  it("leaves no draft and no final note when the agent writes the draft and then fails", async () => {
    const { brain, deps } = noteSetup("note-write-then-fail");
    try {
      const job = await runOne(deps, "daily-note", PARAMS);
      expect(job.status).toBe("failed");
      expect(job.result).toBeNull();
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
      expect(existsSync(join(brain.root, PATH))).toBe(false);
      expect(brain.git("status", "--porcelain")).toBe("");
      expect(brain.git("log", "--oneline").trim().split("\n")).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("counts the published path as the run's own before the agent starts", async () => {
    const { brain, deps } = noteSetup("note-ok");
    const run = deps.run;
    let sidecar = "";
    deps.run = (options) => {
      sidecar = readFileSync(touchedPath(deps.quarantineRoot, 1), "utf8");
      return run(options);
    };
    try {
      await runOne(deps, "daily-note", PARAMS);
      expect(sidecar).toContain(JSON.stringify(PATH));
    } finally {
      brain.cleanup();
    }
  });
});
