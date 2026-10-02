import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotRun } from "@/lib/agents/brain-git";
import { GOOD_NOTE, noteFileText } from "@/tests/helpers/note";
import { setup } from "@/tests/helpers/run-job";
import { pendingRecovery, recoverRuns, writeRunMarker } from "./run-marker";
import { touchedLog } from "./touched-log";

const STAMP = "2026-10-02-0630";
const PATH = `notes/daily/${STAMP}.md`;
const DRAFT = `notes/daily/${STAMP}.draft.md`;

describe("a daily note run that dies after publishing and before the commit", () => {
  it("is discarded by startup recovery: no draft and no published file are left", () => {
    const { brain, deps } = setup("note-ok");
    try {
      // The state the worker leaves if it dies right after the rename: marker, the touched
      // record made before the agent started, and the published file, uncommitted.
      writeRunMarker(deps.quarantineRoot, 7, snapshotRun(brain.root));
      const log = touchedLog(deps.quarantineRoot, 7);
      log.record(PATH);
      log.record(DRAFT);
      log.seal();
      mkdirSync(join(brain.root, "notes/daily"), { recursive: true });
      writeFileSync(join(brain.root, PATH), noteFileText(GOOD_NOTE));
      expect(pendingRecovery(deps.quarantineRoot)).toEqual(["7"]);

      const result = recoverRuns(brain.root, deps.quarantineRoot);
      expect(result.failed).toEqual([]);
      expect(existsSync(join(brain.root, PATH))).toBe(false);
      expect(existsSync(join(brain.root, DRAFT))).toBe(false);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      brain.cleanup();
    }
  });
});

describe("the fake CLI's Write", () => {
  it("refuses to overwrite an existing note file and reports a tool error, like the real tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "harbour-fake-"));
    try {
      mkdirSync(join(dir, "notes/daily"), { recursive: true });
      writeFileSync(join(dir, DRAFT), "old");
      const run = spawnSync(
        process.execPath,
        [join(process.cwd(), "tests/fixtures/fake-claude.mjs"), "-p", `TARGET_FILES: ${DRAFT}\n`],
        { cwd: dir, env: { ...process.env, FAKE_CLAUDE_SCENARIO: "note-ok" }, encoding: "utf8" },
      );
      expect(run.stdout).toContain('"is_error":true');
      expect(run.stdout).toContain("has not been read yet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
