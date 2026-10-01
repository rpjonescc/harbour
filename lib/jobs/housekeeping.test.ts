import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { housekeepingAction } from "./housekeeping";

const QUIET = 2 * 60_000;
const opts = (pushRetryDue: boolean) => ({ quietMs: QUIET, pushRetryDue });

/** Writes a file and sets its mtime to `at`. */
function edit(root: string, path: string, at: Date) {
  writeFileSync(join(root, path), "# edited\n");
  utimesSync(join(root, path), at, at);
}

describe("housekeepingAction", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("waits while the newest edit is fresh, then saves the notes", () => {
    const brain = makeGitBrain({});
    try {
      edit(brain.root, "old.md", ago(10 * 60_000));
      edit(brain.root, "fresh.md", ago(30_000));
      expect(housekeepingAction(brain.root, now, opts(true))).toBeNull();
      edit(brain.root, "fresh.md", ago(QUIET));
      expect(housekeepingAction(brain.root, now, opts(false))).toBe("notes-sync");
    } finally {
      brain.cleanup();
    }
  });

  it("dates a deletion by its folder, so a deletion alone is saved once quiet", () => {
    const brain = makeGitBrain({ "notes/gone.md": "# gone\n" });
    try {
      rmSync(join(brain.root, "notes/gone.md"));
      const deletedAt = Date.now();
      expect(housekeepingAction(brain.root, new Date(deletedAt), opts(true))).toBeNull();
      expect(housekeepingAction(brain.root, new Date(deletedAt + QUIET + 1000), opts(true))).toBe(
        "notes-sync",
      );
    } finally {
      brain.cleanup();
    }
  });

  it("pushes unpushed commits on a clean brain only when the retry is due", () => {
    const brain = makeGitBrain({});
    try {
      expect(housekeepingAction(brain.root, now, opts(true))).toBeNull();
      writeFileSync(join(brain.root, "note.md"), "# note\n");
      brain.git("add", "note.md");
      brain.git("commit", "-q", "-m", "local");
      expect(housekeepingAction(brain.root, now, opts(true))).toBe("brain-push");
      expect(housekeepingAction(brain.root, now, opts(false))).toBeNull();
    } finally {
      brain.cleanup();
    }
  });

  it("returns null, without throwing, for a missing brain or a folder that is not a repo root", () => {
    const brain = makeGitBrain({});
    const errors = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const missing = join(brain.root, "nope");
      expect(housekeepingAction(missing, now, opts(true))).toBeNull();
      expect(housekeepingAction(missing, now, opts(true))).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
      edit(brain.root, "old.md", ago(10 * 60_000));
      mkdirSync(join(brain.root, "sub"));
      expect(housekeepingAction(join(brain.root, "sub"), now, opts(true))).toBeNull();
      rmSync(join(brain.root, ".git"), { recursive: true });
      expect(housekeepingAction(brain.root, now, opts(true))).toBeNull();
    } finally {
      errors.mockRestore();
      brain.cleanup();
    }
  });
});
