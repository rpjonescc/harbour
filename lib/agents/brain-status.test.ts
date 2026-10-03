import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { brainSyncStatus, quarantineRootFor } from "./brain-status";

const gitMocks = vi.hoisted(() => ({ failOwnerChanges: false, ownerChangeCalls: 0 }));
vi.mock("./brain-git", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./brain-git")>();
  return {
    ...actual,
    ownerChanges: (root: string) => {
      gitMocks.ownerChangeCalls += 1;
      if (gitMocks.failOwnerChanges) throw new Error("git exploded");
      return actual.ownerChanges(root);
    },
  };
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  gitMocks.failOwnerChanges = false;
  gitMocks.ownerChangeCalls = 0;
  vi.restoreAllMocks();
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "harbour-status-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

describe("quarantineRootFor", () => {
  it("sits next to the database", () => {
    expect(quarantineRootFor("./data/harbour.db")).toBe(join("data", "quarantine"));
  });
});

describe("brainSyncStatus", () => {
  it("counts unsaved files and unpushed commits in the brain repo", () => {
    const brain = makeGitBrain({ "notes.md": "a\n" });
    cleanups.push(brain.cleanup);
    writeFileSync(join(brain.root, "notes.md"), "b\n");
    writeFileSync(join(brain.root, "new.md"), "c\n");
    brain.git("commit", "-q", "--allow-empty", "-m", "local");
    const status = brainSyncStatus(brain.root, tempDir());
    expect(status.sync).toEqual({ unsaved: 2, unpushed: 1 });
    expect(status.recovery).toEqual({ pending: [], lastError: null });
  });

  it("reports an unknown unpushed count as null, never as synced", () => {
    const brain = makeGitBrain({});
    cleanups.push(brain.cleanup);
    brain.git("branch", "--unset-upstream");
    expect(brainSyncStatus(brain.root, tempDir()).sync).toEqual({ unsaved: 0, unpushed: null });
  });

  it("quietly hides sync counts when the brain is not its own repository root", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const brain = makeBrain({ "a.md": "x\n" });
    cleanups.push(brain.cleanup);
    expect(brainSyncStatus(brain.root, tempDir()).sync).toBeNull();
    expect(brainSyncStatus(join(brain.root, "missing"), tempDir()).sync).toBeNull();
    expect(brainSyncStatus(brain.root, tempDir()).syncFailed).toBe(false);
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs unexpected git failures and still hides the counts", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const brain = makeGitBrain({ "notes.md": "a\n" });
    cleanups.push(brain.cleanup);
    gitMocks.failOwnerChanges = true;
    expect(brainSyncStatus(brain.root, tempDir())).toMatchObject({ sync: null, syncFailed: true });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.join(" "))).toContain("git exploded");
  });

  it("reports pending recoveries and the last recovery error", () => {
    const brain = makeBrain({ "a.md": "x\n" });
    cleanups.push(brain.cleanup);
    const quarantine = tempDir();
    mkdirSync(join(quarantine, "active"));
    writeFileSync(join(quarantine, "active", "job-7.json"), "{}");
    writeFileSync(join(quarantine, "active", "recovery-error.txt"), "job 7: boom\n");
    expect(brainSyncStatus(brain.root, quarantine).recovery).toEqual({
      pending: ["7"],
      lastError: "job 7: boom",
    });
  });

  it("runs no git in the brain while an agent run is active (its marker is in place)", () => {
    const brain = makeGitBrain({});
    cleanups.push(brain.cleanup);
    const quarantine = tempDir();
    mkdirSync(join(quarantine, "active"));
    writeFileSync(join(quarantine, "active", "job-9.json"), "{}");
    const status = brainSyncStatus(brain.root, quarantine);
    expect(status.sync).toBeNull();
    expect(status.recovery.pending).toEqual(["9"]);
    expect(gitMocks.ownerChangeCalls).toBe(0);
  });
});
