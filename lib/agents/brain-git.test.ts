import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import {
  changedPaths,
  commitChanges,
  isAllowedChange,
  partitionChanges,
  pushBrain,
  redactCredentials,
  rejectSymlinks,
  restoreChanges,
  snapshotIgnored,
  unpushedCount,
} from "./brain-git";

const research = { prefixes: ["research/"], exact: ["00-start-here.md"] };

describe("isAllowedChange", () => {
  it("allows markdown inside the area and exact paths only", () => {
    expect(isAllowedChange("research/geo/a.md", research)).toBe(true);
    expect(isAllowedChange("00-start-here.md", research)).toBe(true);
    expect(isAllowedChange("research/geo/a.json", research)).toBe(false);
    expect(isAllowedChange("products/x/notes.md", research)).toBe(false);
    expect(isAllowedChange("research/../products/x.md", research)).toBe(false);
  });
  it("allows proposals.json only when listed exactly", () => {
    const discovery = {
      prefixes: ["products/acme-docs/"],
      exact: ["products/acme-docs/proposals.json"],
    };
    expect(isAllowedChange("products/acme-docs/proposals.json", discovery)).toBe(true);
    expect(isAllowedChange("products/acme-docs/other.json", discovery)).toBe(false);
  });
});

describe("git gate", () => {
  it("lists changes, restores rejected ones, commits allowed ones and pushes", () => {
    const b = makeGitBrain({ "products/acme-docs/notes.md": "# Notes\n" });
    try {
      mkdirSync(join(b.root, "research/geo"), { recursive: true });
      writeFileSync(join(b.root, "research/geo/a.md"), "# A\n");
      writeFileSync(join(b.root, "products/acme-docs/notes.md"), "# Tampered\n");
      writeFileSync(join(b.root, "stray.txt"), "x");

      const changes = changedPaths(b.root);
      expect(changes.map((c) => c.path).sort()).toEqual([
        "products/acme-docs/notes.md",
        "research/geo/a.md",
        "stray.txt",
      ]);
      const { allowed, rejected } = partitionChanges(changes, research);
      expect(allowed.map((c) => c.path)).toEqual(["research/geo/a.md"]);

      restoreChanges(b.root, rejected);
      expect(existsSync(join(b.root, "stray.txt"))).toBe(false);
      expect(b.git("show", "HEAD:products/acme-docs/notes.md")).toBe("# Notes\n");
      expect(changedPaths(b.root).map((c) => c.path)).toEqual(["research/geo/a.md"]);

      const sha = commitChanges(b.root, ["research/geo/a.md"], "agent(research): add a");
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(changedPaths(b.root)).toEqual([]);
      expect(unpushedCount(b.root)).toBe(1);
      expect(pushBrain(b.root)).toEqual({ ok: true });
      expect(unpushedCount(b.root)).toBe(0);
    } finally {
      b.cleanup();
    }
  });

  it("handles paths with spaces and unusual characters", () => {
    const b = makeGitBrain({});
    try {
      mkdirSync(join(b.root, "research/my topic"), { recursive: true });
      const odd = 'research/my topic/it\'s "odd" é.md';
      writeFileSync(join(b.root, odd), "# Odd\n");
      expect(changedPaths(b.root)).toEqual([{ path: odd, untracked: true }]);
      commitChanges(b.root, [odd], "odd");
      writeFileSync(join(b.root, odd), "# Odd 2\n");
      expect(changedPaths(b.root)).toEqual([{ path: odd, untracked: false }]);
      restoreChanges(b.root, changedPaths(b.root));
      expect(changedPaths(b.root)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("reports a push failure instead of throwing", () => {
    const b = makeGitBrain({});
    try {
      b.git("remote", "set-url", "origin", "/nonexistent/remote.git");
      writeFileSync(join(b.root, "x.md"), "# x\n");
      commitChanges(b.root, ["x.md"], "x");
      const result = pushBrain(b.root);
      expect(result.ok).toBe(false);
    } finally {
      b.cleanup();
    }
  });
});

describe("git gate hardening", () => {
  it("treats file names literally, never as pathspec magic", () => {
    const b = makeGitBrain({});
    try {
      mkdirSync(join(b.root, "research"), { recursive: true });
      writeFileSync(join(b.root, ":(exclude)zz"), "x");
      writeFileSync(join(b.root, "research/*"), "x");
      writeFileSync(join(b.root, "keep.md"), "# keep\n");
      writeFileSync(join(b.root, "research/keep.md"), "# keep\n");
      const magic = changedPaths(b.root).filter(
        (c) => c.path === ":(exclude)zz" || c.path === "research/*",
      );
      expect(magic).toHaveLength(2);
      restoreChanges(b.root, magic);
      expect(existsSync(join(b.root, ":(exclude)zz"))).toBe(false);
      expect(existsSync(join(b.root, "research/*"))).toBe(false);
      expect(existsSync(join(b.root, "keep.md"))).toBe(true);
      expect(existsSync(join(b.root, "research/keep.md"))).toBe(true);
    } finally {
      b.cleanup();
    }
  });

  it("never runs an fsmonitor command from repo config", () => {
    const b = makeGitBrain({});
    try {
      const marker = join(b.root, "..", `fsmonitor-ran-${process.pid}`);
      b.git("config", "core.fsmonitor", `touch ${marker}; echo`);
      changedPaths(b.root);
      expect(existsSync(marker)).toBe(false);
    } finally {
      b.cleanup();
    }
  });

  it("detects and removes new files hidden by an agent-written .gitignore", () => {
    const b = makeGitBrain({});
    try {
      const baseline = snapshotIgnored(b.root);
      mkdirSync(join(b.root, "products/x"), { recursive: true });
      writeFileSync(join(b.root, "products/.gitignore"), "*\n!.gitignore\n");
      writeFileSync(join(b.root, "products/x/evil.md"), "# evil\n");
      const changes = changedPaths(b.root, baseline);
      expect(changes.map((c) => c.path).sort()).toEqual([
        "products/.gitignore",
        "products/x/evil.md",
      ]);
      const { rejected } = partitionChanges(changes, research);
      expect(rejected).toHaveLength(2);
      restoreChanges(b.root, rejected, { baseline, allowed: research });
      expect(existsSync(join(b.root, "products/x/evil.md"))).toBe(false);
      expect(changedPaths(b.root, baseline)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("ignores files that were already ignored before the run", () => {
    const b = makeGitBrain({ ".gitignore": "*.log\n" });
    try {
      writeFileSync(join(b.root, "old.log"), "x");
      const baseline = snapshotIgnored(b.root);
      expect(changedPaths(b.root, baseline)).toEqual([]);
      writeFileSync(join(b.root, "new.log"), "x");
      expect(changedPaths(b.root, baseline).map((c) => c.path)).toEqual(["new.log"]);
    } finally {
      b.cleanup();
    }
  });

  it("throws instead of reporting success when a rejected path cannot be removed", () => {
    const b = makeGitBrain({});
    try {
      mkdirSync(join(b.root, "locked"), { recursive: true });
      writeFileSync(join(b.root, "locked/a.txt"), "x");
      chmodSync(join(b.root, "locked"), 0o555);
      const changes = changedPaths(b.root);
      expect(() => restoreChanges(b.root, changes)).toThrow();
      expect(existsSync(join(b.root, "locked/a.txt"))).toBe(true);
    } finally {
      chmodSync(join(b.root, "locked"), 0o755);
      b.cleanup();
    }
  });

  it("also removes out-of-scope changes that appear after the first scan", () => {
    const b = makeGitBrain({});
    try {
      writeFileSync(join(b.root, "stray.txt"), "x");
      const changes = changedPaths(b.root);
      writeFileSync(join(b.root, "late.txt"), "x");
      restoreChanges(b.root, changes, { allowed: research });
      expect(existsSync(join(b.root, "late.txt"))).toBe(false);
    } finally {
      b.cleanup();
    }
  });

  it("refuses to commit nothing", () => {
    const b = makeGitBrain({});
    try {
      expect(() => commitChanges(b.root, [], "empty")).toThrow("nothing to commit");
    } finally {
      b.cleanup();
    }
  });

  it("restores a rename out of a rejected area, including the deleted source", () => {
    const b = makeGitBrain({ "products/acme-docs/notes.md": "# Notes\n" });
    try {
      mkdirSync(join(b.root, "research"), { recursive: true });
      b.git("mv", "products/acme-docs/notes.md", "research/notes.md");
      const changes = changedPaths(b.root);
      expect(changes.map((c) => c.path).sort()).toEqual([
        "products/acme-docs/notes.md",
        "research/notes.md",
      ]);
      const { allowed, rejected } = partitionChanges(changes, research);
      expect(allowed).toEqual([]);
      expect(rejected).toHaveLength(2);
      restoreChanges(b.root, rejected);
      expect(b.git("show", "HEAD:products/acme-docs/notes.md")).toBe("# Notes\n");
      expect(existsSync(join(b.root, "products/acme-docs/notes.md"))).toBe(true);
      expect(existsSync(join(b.root, "research/notes.md"))).toBe(false);
      expect(changedPaths(b.root)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("rejects a rename out of the allowed area", () => {
    const b = makeGitBrain({ "research/a.md": "# A\n" });
    try {
      b.git("mv", "research/a.md", "stolen.md");
      const { allowed, rejected } = partitionChanges(changedPaths(b.root), research);
      expect(allowed).toEqual([]);
      expect(rejected).toHaveLength(2);
    } finally {
      b.cleanup();
    }
  });

  it("rejects symlinks even when the name is allowed", () => {
    const b = makeGitBrain({});
    try {
      mkdirSync(join(b.root, "research"), { recursive: true });
      symlinkSync("/etc/hostname", join(b.root, "research/l.md"));
      const changes = changedPaths(b.root);
      expect(partitionChanges(changes, research).allowed).toHaveLength(1);
      const gated = partitionChanges(changes, research, b.root);
      expect(gated.allowed).toEqual([]);
      expect(rejectSymlinks(b.root, changes).symlinks).toHaveLength(1);
      restoreChanges(b.root, gated.rejected);
      expect(existsSync(join(b.root, "research/l.md"))).toBe(false);
      expect(existsSync("/etc/hostname")).toBe(true);
    } finally {
      b.cleanup();
    }
  });

  it("requires prefixes to end with a slash", () => {
    expect(() => isAllowedChange("research/a.md", { prefixes: ["research"], exact: [] })).toThrow();
  });

  it("strips credentials from push errors", () => {
    expect(
      redactCredentials("fatal: unable to access 'https://user:s3cret@example.com/x.git'"),
    ).not.toContain("s3cret");
    const b = makeGitBrain({});
    try {
      b.git("remote", "set-url", "origin", "https://user:s3cret@127.0.0.1:1/x.git");
      writeFileSync(join(b.root, "x.md"), "# x\n");
      commitChanges(b.root, ["x.md"], "x");
      const result = pushBrain(b.root);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("s3cret");
    } finally {
      b.cleanup();
    }
  });
});
