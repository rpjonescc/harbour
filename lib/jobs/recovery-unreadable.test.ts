import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestDb } from "@/tests/helpers/db";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { recoveryBlock } from "./git-jobs";
import { housekeepingAction } from "./housekeeping";
import { pendingRecovery, recoveryStatus } from "./run-marker";
import { makeScheduler } from "./scheduler";

/** A quarantine whose run-marker folder cannot be listed (a file stands where it should be). */
function unreadableQuarantine() {
  const quarantineRoot = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  writeFileSync(join(quarantineRoot, "active"), "not a folder\n");
  return {
    quarantineRoot,
    cleanup: () => rmSync(quarantineRoot, { recursive: true, force: true }),
  };
}

describe("an unreadable run-marker folder", () => {
  it("means nothing to recover only when the folder is missing", () => {
    const { quarantineRoot, cleanup } = unreadableQuarantine();
    try {
      expect(pendingRecovery(join(quarantineRoot, "missing"))).toEqual([]);
      expect(() => pendingRecovery(quarantineRoot)).toThrow(/couldn't check/i);
    } finally {
      cleanup();
    }
  });

  it("blocks new agent runs and autosave instead of letting them start on leftovers", () => {
    const { quarantineRoot, cleanup } = unreadableQuarantine();
    const brain = makeGitBrain({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(recoveryBlock(quarantineRoot)).toMatch(/couldn't check/i);
      writeFileSync(join(brain.root, "note.md"), "# note\n");
      const later = new Date(Date.now() + 60 * 60_000);
      const opts = { quietMs: 60_000, pushRetryDue: true, quarantineRoot };
      expect(housekeepingAction(brain.root, later, opts)).toBeNull();
    } finally {
      warn.mockRestore();
      brain.cleanup();
      cleanup();
    }
  });

  it("is reported as not checked, not as nothing pending", () => {
    const { quarantineRoot, cleanup } = unreadableQuarantine();
    try {
      const status = recoveryStatus(quarantineRoot);
      expect(status.pending).toBeNull();
      expect(status.lastError).toMatch(/couldn't check/i);
    } finally {
      cleanup();
    }
  });

  it("never crashes the scheduler at startup or between jobs", () => {
    const { quarantineRoot, cleanup } = unreadableQuarantine();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const scheduler = makeScheduler({
        db: openTestDb(),
        root: "/nonexistent-brain",
        quarantineRoot,
        clock: () => 0,
        action: () => null,
      });
      expect(() => scheduler.startup()).not.toThrow();
      expect(() => scheduler.tick()).not.toThrow();
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
      cleanup();
    }
  });
});
