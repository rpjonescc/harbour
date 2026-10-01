import {
  appendFileSync,
  existsSync,
  mkdirSync,
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
  readTouched,
  recoverRuns,
  recoveryStatus,
  removeRunMarker,
  touchedLog,
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

  it("keeps a marker that cannot be read while the brain has uncommitted changes", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      writeRunMarker(quarantineRoot, 5, snapshotRun(brain.root));
      writeFileSync(join(quarantineRoot, "active", "job-5.json"), "{ nope");
      writeFileSync(join(brain.root, "partial.md"), "# partial\n");
      const result = recoverRuns(brain.root, quarantineRoot);
      expect(result.failed).toMatchObject([
        { jobId: "5", error: expect.stringMatching(/unreadable/) },
      ]);
      expect(recoveryStatus(quarantineRoot)).toEqual({
        pending: ["5"],
        lastError: expect.stringMatching(/job 5: .*unreadable/),
      });
    } finally {
      cleanup();
    }
  });

  it("sets an unreadable marker aside when the brain is clean, and proceeds", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      writeRunMarker(quarantineRoot, 5, snapshotRun(brain.root));
      writeFileSync(join(quarantineRoot, "active", "job-5.json"), "{ nope");
      const result = recoverRuns(brain.root, quarantineRoot);
      expect(result.failed).toEqual([]);
      expect(result.corrupt).toEqual([
        {
          jobId: "5",
          error: expect.any(String),
          movedTo: join(quarantineRoot, "corrupt", "job-5.json"),
        },
      ]);
      expect(readFileSync(join(quarantineRoot, "corrupt", "job-5.json"), "utf8")).toBe("{ nope");
      expect(recoveryStatus(quarantineRoot)).toEqual({
        pending: [],
        lastError: expect.stringMatching(/job 5: .*unreadable.*corrupt/),
      });
    } finally {
      cleanup();
    }
  });

  it("records the last recovery error and clears it once recovery succeeds", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      expect(recoveryStatus(quarantineRoot)).toEqual({ pending: [], lastError: null });
      writeRunMarker(quarantineRoot, 8, snapshotRun(brain.root));
      writeFileSync(join(brain.root, "partial.md"), "# partial\n");
      recoverRuns(join(brain.root, "notes"), quarantineRoot);
      expect(recoveryStatus(quarantineRoot)).toEqual({
        pending: ["8"],
        lastError: expect.stringMatching(/job 8: HARBOUR_BRAIN_DIR must be the root/),
      });
      expect(recoverRuns(brain.root, quarantineRoot).failed).toEqual([]);
      expect(recoveryStatus(quarantineRoot)).toEqual({ pending: [], lastError: null });
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

describe("touched-path sidecar", () => {
  const sidecar = (quarantineRoot: string, id: number) =>
    join(quarantineRoot, "active", `job-${id}.touched`);

  it("records each path once and is trusted only once sealed", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      expect(readTouched(quarantineRoot, 6)).toBe("all");
      writeRunMarker(quarantineRoot, 6, snapshotRun(brain.root));
      const log = touchedLog(quarantineRoot, 6);
      log.record("research/a.md");
      log.record("research/a.md");
      log.record('notes/odd "name".md');
      expect(log.touched()).toEqual(new Set(["research/a.md", 'notes/odd "name".md']));
      expect(readTouched(quarantineRoot, 6)).toBe("all"); // the run may still be writing
      log.seal();
      expect(readTouched(quarantineRoot, 6)).toEqual(log.touched());
      expect(statSync(sidecar(quarantineRoot, 6)).mode & 0o777).toBe(0o600);
      expect(pendingRecovery(quarantineRoot)).toEqual(["6"]);
      removeRunMarker(quarantineRoot, 6);
      expect(existsSync(sidecar(quarantineRoot, 6))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("falls back to every change for an unknown write, an overflow or a damaged file", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      writeRunMarker(quarantineRoot, 1, snapshotRun(brain.root));
      const unknown = touchedLog(quarantineRoot, 1);
      unknown.record("research/a.md");
      unknown.record("*");
      unknown.seal();
      expect(unknown.touched()).toBe("all");
      expect(readTouched(quarantineRoot, 1)).toBe("all");

      const big = touchedLog(quarantineRoot, 2);
      for (let i = 0; i <= 10_000; i++) big.record(`research/${i}.md`);
      big.seal();
      expect(big.touched()).toBe("all");
      expect(readTouched(quarantineRoot, 2)).toBe("all");
      expect(readFileSync(sidecar(quarantineRoot, 2), "utf8").split("\n").length).toBeLessThan(
        10_003,
      );

      const damaged = touchedLog(quarantineRoot, 3);
      damaged.record("research/a.md");
      damaged.seal();
      appendFileSync(sidecar(quarantineRoot, 3), "{ nope\n");
      expect(readTouched(quarantineRoot, 3)).toBe("all");
    } finally {
      cleanup();
    }
  });

  it("lets recovery leave the owner's changes alone when the agent's writes are known", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      writeRunMarker(quarantineRoot, 9, snapshotRun(brain.root));
      const log = touchedLog(quarantineRoot, 9);
      log.record("research/partial.md");
      log.seal();
      mkdirSync(join(brain.root, "research"));
      writeFileSync(join(brain.root, "research/partial.md"), "# partial\n");
      writeFileSync(join(brain.root, "notes/a.md"), "# owner edit\n");
      writeFileSync(join(brain.root, "notes/b.md"), "# owner idea\n");

      expect(recoverRuns(brain.root, quarantineRoot).failed).toEqual([]);
      expect(existsSync(join(brain.root, "research/partial.md"))).toBe(false);
      expect(existsSync(join(quarantineRoot, "job-9", "research/partial.md"))).toBe(true);
      expect(readFileSync(join(brain.root, "notes/a.md"), "utf8")).toBe("# owner edit\n");
      expect(readFileSync(join(brain.root, "notes/b.md"), "utf8")).toBe("# owner idea\n");
      expect(pendingRecovery(quarantineRoot)).toEqual([]);
      expect(existsSync(sidecar(quarantineRoot, 9))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("makes recovery discard everything without a sealed sidecar", () => {
    const { brain, quarantineRoot, cleanup } = setup();
    try {
      writeRunMarker(quarantineRoot, 10, snapshotRun(brain.root));
      touchedLog(quarantineRoot, 10).record("research/partial.md"); // worker died mid-run
      writeFileSync(join(brain.root, "notes/a.md"), "# owner edit\n");
      expect(recoverRuns(brain.root, quarantineRoot).failed).toEqual([]);
      expect(readFileSync(join(brain.root, "notes/a.md"), "utf8")).toBe("# A\n");
      expect(readFileSync(join(quarantineRoot, "job-10", "notes/a.md"), "utf8")).toBe(
        "# owner edit\n",
      );
    } finally {
      cleanup();
    }
  });
});
