import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotRun } from "@/lib/agents/brain-git";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { housekeepingAction } from "./housekeeping";
import {
  freshQuarantineDir,
  pendingRecovery,
  recoverRuns,
  removeRunMarker,
  writeRunMarker,
} from "./run-marker";

function setup() {
  const brain = makeGitBrain({ "notes/a.md": "# A\n" });
  const quarantineRoot = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  return {
    brain,
    quarantineRoot,
    cleanup: () => {
      brain.cleanup();
      rmSync(quarantineRoot, { recursive: true, force: true });
    },
  };
}

describe("run markers", () => {
  it("are private files listed by job id until removed", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      expect(pendingRecovery(join(quarantineRoot, "missing"))).toEqual([]);
      writeRunMarker(quarantineRoot, 7, snapshotRun(brain.root));
      writeRunMarker(quarantineRoot, 12, snapshotRun(brain.root));
      expect(pendingRecovery(quarantineRoot)).toEqual(["7", "12"]);
      expect(statSync(join(quarantineRoot, "active")).mode & 0o777).toBe(0o700);
      expect(statSync(join(quarantineRoot, "active", "job-7.json")).mode & 0o777).toBe(0o600);
      removeRunMarker(quarantineRoot, 7);
      expect(pendingRecovery(quarantineRoot)).toEqual(["12"]);
    } finally {
      cleanup();
    }
  });

  it("block autosave, then recovery restores git config, quarantines files and clears the marker", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      const config = readFileSync(join(brain.root, ".git/config"));
      writeRunMarker(quarantineRoot, 3, snapshotRun(brain.root));
      writeFileSync(join(brain.root, "outside.md"), "# partial\n");
      writeFileSync(join(brain.root, "notes/a.md"), "# changed\n");
      appendFileSync(join(brain.root, ".git/config"), "[core]\n\tpager = evil\n");
      const later = new Date(Date.now() + 60 * 60_000);
      const opts = { quietMs: 0, pushRetryDue: true, quarantineRoot };
      expect(housekeepingAction(brain.root, later, opts)).toBeNull();

      const result = recoverRuns(brain.root, quarantineRoot);
      expect(result.failed).toEqual([]);
      expect(result.recovered).toMatchObject([{ jobId: "3", dir: join(quarantineRoot, "job-3") }]);
      expect(readFileSync(join(brain.root, ".git/config"))).toEqual(config);
      expect(existsSync(join(brain.root, "outside.md"))).toBe(false);
      expect(readFileSync(join(brain.root, "notes/a.md"), "utf8")).toBe("# A\n");
      expect(existsSync(join(quarantineRoot, "job-3", "outside.md"))).toBe(true);
      expect(readFileSync(join(quarantineRoot, "job-3", "notes/a.md"), "utf8")).toBe("# changed\n");
      expect(pendingRecovery(quarantineRoot)).toEqual([]);
      expect(brain.git("status", "--porcelain")).toBe("");
    } finally {
      cleanup();
    }
  });

  it("keeps a marker whose recovery fails", () => {
    const { brain, cleanup } = setup();
    try {
      // A quarantine inside the brain is refused, so the discard throws.
      const inside = join(brain.root, "q");
      writeRunMarker(inside, 4, snapshotRun(brain.root));
      writeFileSync(join(brain.root, "outside.md"), "# partial\n");
      const result = recoverRuns(brain.root, inside);
      expect(result.recovered).toEqual([]);
      expect(result.failed).toMatchObject([{ jobId: "4" }]);
      expect(pendingRecovery(inside)).toEqual(["4"]);
    } finally {
      cleanup();
    }
  });

  it("keeps a marker that cannot be read", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      writeRunMarker(quarantineRoot, 5, snapshotRun(brain.root));
      writeFileSync(join(quarantineRoot, "active", "job-5.json"), "{ nope");
      const result = recoverRuns(brain.root, quarantineRoot);
      expect(result.failed).toMatchObject([{ jobId: "5" }]);
      expect(pendingRecovery(quarantineRoot)).toEqual(["5"]);
    } finally {
      cleanup();
    }
  });

  it("picks a fresh quarantine folder", () => {
    const { quarantineRoot, cleanup } = setup();
    try {
      expect(freshQuarantineDir(quarantineRoot, 1)).toBe(join(quarantineRoot, "job-1"));
      writeFileSync(join(quarantineRoot, "job-1"), "not a folder");
      expect(freshQuarantineDir(quarantineRoot, 1)).toBe(join(quarantineRoot, "job-1-2"));
    } finally {
      cleanup();
    }
  });
});
