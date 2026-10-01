import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { discardRun } from "./brain-discard";
import { inspectRun, snapshotRun } from "./brain-git";

const research = { prefixes: ["research/"], exact: ["00-start-here.md"] };
const paths = (changes: { path: string }[]) => changes.map((c) => c.path).sort();

const quarantines: string[] = [];
const quarantine = () => {
  const dir = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  quarantines.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of quarantines.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(b: ReturnType<typeof makeGitBrain>, path: string, content = "x\n") {
  mkdirSync(join(b.root, path.split("/").slice(0, -1).join("/") || "."), { recursive: true });
  writeFileSync(join(b.root, path), content);
}

describe("discardRun quarantine", () => {
  it("quarantines new and modified files before discarding them", () => {
    const b = makeGitBrain({ "notes/old.md": "# Old\n" });
    try {
      const snap = snapshotRun(b.root);
      write(b, "notes/mid-run.md", "# Written by the owner mid-run\n");
      write(b, "notes/old.md", "# Edited mid-run\n");
      symlinkSync("/etc/hostname", join(b.root, "link.md"));
      const dir = quarantine();
      const { quarantined } = discardRun(b.root, snap, dir, "all");
      expect(quarantined.sort()).toEqual(["notes/mid-run.md", "notes/old.md"]);
      expect(readFileSync(join(dir, "notes/mid-run.md"), "utf8")).toBe(
        "# Written by the owner mid-run\n",
      );
      expect(readFileSync(join(dir, "notes/old.md"), "utf8")).toBe("# Edited mid-run\n");
      expect(readFileSync(join(dir, "MANIFEST.txt"), "utf8")).toContain("link.md: symlink");
      expect(readFileSync(join(b.root, "notes/old.md"), "utf8")).toBe("# Old\n");
    } finally {
      b.cleanup();
    }
  });

  it("quarantines a nested repo created mid-run, including its .git", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      const clone = join(b.root, "clone");
      mkdirSync(clone);
      execFileSync("git", ["init", "-q", clone]);
      writeFileSync(join(clone, "committed.md"), "# committed\n");
      execFileSync("git", ["-C", clone, "add", "."]);
      execFileSync("git", [
        "-C",
        clone,
        "-c",
        "user.name=T",
        "-c",
        "user.email=t@example.com",
        "commit",
        "-qm",
        "c",
      ]);
      writeFileSync(join(clone, "uncommitted.md"), "# uncommitted\n");
      const dir = quarantine();
      const { quarantined } = discardRun(b.root, snap, dir, "all");
      expect(readFileSync(join(dir, "clone/committed.md"), "utf8")).toBe("# committed\n");
      expect(readFileSync(join(dir, "clone/uncommitted.md"), "utf8")).toBe("# uncommitted\n");
      expect(existsSync(join(dir, "clone/.git/HEAD"))).toBe(true);
      expect(quarantined).toContain("clone/uncommitted.md");
      expect(readFileSync(join(dir, "MANIFEST.txt"), "utf8")).toContain("clone/.git/HEAD: copied");
      expect(existsSync(join(b.root, "clone"))).toBe(false);
    } finally {
      b.cleanup();
    }
  });

  it("refuses a non-empty quarantine directory", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      write(b, "stray.txt");
      const dir = quarantine();
      writeFileSync(join(dir, "earlier.txt"), "keep");
      expect(() => discardRun(b.root, snap, dir, "all")).toThrow(/empty/);
      expect(existsSync(join(b.root, "stray.txt"))).toBe(true);
    } finally {
      b.cleanup();
    }
  });

  it("refuses a quarantine directory that is inside the brain via a symlink", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      mkdirSync(join(b.root, "inner"));
      const viaLink = join(quarantine(), "link");
      symlinkSync(join(b.root, "inner"), viaLink);
      write(b, "stray.txt");
      expect(() => discardRun(b.root, snap, viaLink, "all")).toThrow(/outside the brain/);
      expect(existsSync(join(b.root, "stray.txt"))).toBe(true);
    } finally {
      b.cleanup();
    }
  });

  it("fails closed instead of deleting a file too large to quarantine", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      const big = join(b.root, "big.bin");
      writeFileSync(big, "");
      truncateSync(big, 51 * 1024 * 1024);
      expect(() => discardRun(b.root, snap, quarantine(), "all")).toThrow(/too large/);
      expect(existsSync(big)).toBe(true);
    } finally {
      b.cleanup();
    }
  });

  it("does not follow a symlinked .git/info when restoring", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      const outside = mkdtempSync(join(tmpdir(), "harbour-outside-"));
      quarantines.push(outside);
      rmSync(join(b.root, ".git/info"), { recursive: true, force: true });
      symlinkSync(outside, join(b.root, ".git/info"));
      discardRun(b.root, snap, quarantine(), "all");
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("refuses a quarantine directory inside the brain", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      expect(() => discardRun(b.root, snap, join(b.root, "q"), "all")).toThrow();
    } finally {
      b.cleanup();
    }
  });

  it("keeps the owner's pre-existing ignored files through discardRun", () => {
    const b = makeGitBrain({ ".gitignore": "*.local\n" });
    try {
      write(b, "owner.local", "mine");
      const snap = snapshotRun(b.root);
      write(b, "stray.txt");
      const inspected = inspectRun(b.root, snap, research, "all");
      expect(paths(inspected.rejected)).toEqual(["stray.txt"]);
      expect(inspected.tampered).toEqual([]);
      discardRun(b.root, snap, quarantine(), "all");
      expect(readFileSync(join(b.root, "owner.local"), "utf8")).toBe("mine");
    } finally {
      b.cleanup();
    }
  });

  it("throws instead of reporting success when a change cannot be removed", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      write(b, "locked/a.txt");
      chmodSync(join(b.root, "locked"), 0o555);
      expect(() => discardRun(b.root, snap, quarantine(), "all")).toThrow();
      expect(existsSync(join(b.root, "locked/a.txt"))).toBe(true);
    } finally {
      chmodSync(join(b.root, "locked"), 0o755);
      b.cleanup();
    }
  });

  it("reports tampered git config and info, and discardRun restores them", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      const config = readFileSync(join(b.root, ".git/config"));
      appendFileSync(join(b.root, ".git/config"), '[filter "x"]\n\tclean = touch /tmp/never\n');
      write(b, ".git/info/attributes", "* filter=x\n");
      expect(inspectRun(b.root, snap, research, "all").gitTampered).toEqual([
        ".git/config",
        ".git/info/attributes",
      ]);
      discardRun(b.root, snap, quarantine(), "all");
      expect(readFileSync(join(b.root, ".git/config"))).toEqual(config);
      expect(existsSync(join(b.root, ".git/info/attributes"))).toBe(false);
      expect(inspectRun(b.root, snap, research, "all").gitTampered).toEqual([]);
    } finally {
      b.cleanup();
    }
  });
});
