import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import {
  commitChanges,
  discardRun,
  inspectRun,
  isAllowedChange,
  ownerChanges,
  pushBrain,
  redactCredentials,
  snapshotRun,
  unpushedCount,
} from "./brain-git";

const quarantines: string[] = [];
const quarantine = () => {
  const dir = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  quarantines.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of quarantines.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const research = { prefixes: ["research/"], exact: ["00-start-here.md"] };
type Brain = ReturnType<typeof makeGitBrain>;

function write(b: Brain, path: string, content = "x\n") {
  mkdirSync(join(b.root, path.split("/").slice(0, -1).join("/") || "."), { recursive: true });
  writeFileSync(join(b.root, path), content);
}
const paths = (changes: { path: string }[]) => changes.map((c) => c.path).sort();

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
  it("requires prefixes to end with a slash", () => {
    expect(() => isAllowedChange("research/a.md", { prefixes: ["research"], exact: [] })).toThrow();
  });
  it("rejects any .git path component", () => {
    expect(isAllowedChange("research/sub/.git/x.md", research)).toBe(false);
  });
});

describe("ownerChanges", () => {
  it("lists uncommitted changes but never ignored files, and leaves them alone", () => {
    const b = makeGitBrain({ ".gitignore": "*.local\n" });
    try {
      write(b, "secret.local");
      write(b, "notes/n.md");
      expect(paths(ownerChanges(b.root))).toEqual(["notes/n.md"]);
      commitChanges(b.root, ["notes/n.md"], "owner notes");
      expect(existsSync(join(b.root, "secret.local"))).toBe(true);
    } finally {
      b.cleanup();
    }
  });
});

describe("run gate", () => {
  it("partitions a run, commits the allowed part and pushes", () => {
    const b = makeGitBrain({ "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const snap = snapshotRun(b.root);
      write(b, "research/geo/a.md", "# A\n");
      const inspected = inspectRun(b.root, snap, research);
      expect(paths(inspected.allowed)).toEqual(["research/geo/a.md"]);
      expect(inspected.rejected).toEqual([]);
      expect(inspected.tampered).toEqual([]);

      const sha = commitChanges(b.root, ["research/geo/a.md"], "agent(research): add a");
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
      expect(unpushedCount(b.root)).toBe(1);
      expect(pushBrain(b.root)).toEqual({ ok: true });
      expect(unpushedCount(b.root)).toBe(0);
    } finally {
      b.cleanup();
    }
  });

  it("rejects out-of-scope changes and discardRun restores everything", () => {
    const b = makeGitBrain({ "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const snap = snapshotRun(b.root);
      write(b, "research/geo/a.md", "# A\n");
      write(b, "products/acme-docs/notes.md", "# Tampered\n");
      write(b, "stray.txt");
      const inspected = inspectRun(b.root, snap, research);
      expect(paths(inspected.allowed)).toEqual(["research/geo/a.md"]);
      expect(paths(inspected.rejected)).toEqual(["products/acme-docs/notes.md", "stray.txt"]);

      discardRun(b.root, snap, quarantine());
      expect(existsSync(join(b.root, "stray.txt"))).toBe(false);
      expect(existsSync(join(b.root, "research/geo/a.md"))).toBe(false);
      expect(readFileSync(join(b.root, "products/acme-docs/notes.md"), "utf8")).toBe("# Notes\n");
      expect(ownerChanges(b.root)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("handles paths with spaces and unusual characters", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      const odd = 'research/my topic/it\'s "odd" é.md';
      write(b, odd, "# Odd\n");
      expect(inspectRun(b.root, snap, research).allowed).toEqual([{ path: odd, untracked: true }]);
      commitChanges(b.root, [odd], "odd");
      write(b, odd, "# Odd 2\n");
      expect(inspectRun(b.root, snap, research).allowed).toEqual([{ path: odd, untracked: false }]);
      discardRun(b.root, snap, quarantine());
      expect(ownerChanges(b.root)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("treats file names literally, never as pathspec magic", () => {
    const b = makeGitBrain({ ".gitignore": "*.local\n" });
    try {
      write(b, "owner.local", "mine");
      const snap = snapshotRun(b.root);
      write(b, ":(exclude)zz");
      write(b, "research/*");
      discardRun(b.root, snap, quarantine());
      expect(existsSync(join(b.root, ":(exclude)zz"))).toBe(false);
      expect(existsSync(join(b.root, "research/*"))).toBe(false);
      expect(readFileSync(join(b.root, "owner.local"), "utf8")).toBe("mine");
    } finally {
      b.cleanup();
    }
  });

  it("never runs an fsmonitor command from repo config", () => {
    const b = makeGitBrain({});
    try {
      const marker = join(b.root, "..", `fsmonitor-ran-${process.pid}`);
      b.git("config", "core.fsmonitor", `touch ${marker}; echo`);
      ownerChanges(b.root);
      expect(existsSync(marker)).toBe(false);
    } finally {
      b.cleanup();
    }
  });

  it("detects and removes new files hidden by an agent-written .gitignore", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      write(b, "products/.gitignore", "*\n!.gitignore\n");
      write(b, "products/x/evil.md", "# evil\n");
      const inspected = inspectRun(b.root, snap, research);
      expect(paths(inspected.rejected)).toEqual(["products/.gitignore", "products/x/evil.md"]);
      discardRun(b.root, snap, quarantine());
      expect(existsSync(join(b.root, "products/x/evil.md"))).toBe(false);
      expect(ownerChanges(b.root)).toEqual([]);
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
      const inspected = inspectRun(b.root, snap, research);
      expect(paths(inspected.rejected)).toEqual(["stray.txt"]);
      expect(inspected.tampered).toEqual([]);
      discardRun(b.root, snap, quarantine());
      expect(readFileSync(join(b.root, "owner.local"), "utf8")).toBe("mine");
    } finally {
      b.cleanup();
    }
  });

  it("flags edits to pre-existing ignored files as tampered", () => {
    const b = makeGitBrain({ ".gitignore": ".obsidian/\n" });
    try {
      write(b, ".obsidian/x.js", "old");
      const snap = snapshotRun(b.root);
      write(b, ".obsidian/x.js", "new, longer");
      utimesSync(join(b.root, ".obsidian/x.js"), new Date(), new Date(Date.now() + 5000));
      expect(inspectRun(b.root, snap, research).tampered).toEqual([".obsidian/x.js"]);
    } finally {
      b.cleanup();
    }
  });

  it("flags deleted pre-existing ignored files as tampered", () => {
    const b = makeGitBrain({ ".gitignore": "*.log\n" });
    try {
      write(b, "a.log", "log");
      const snap = snapshotRun(b.root);
      rmSync(join(b.root, "a.log"));
      expect(inspectRun(b.root, snap, research).tampered).toEqual(["a.log"]);
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
      expect(() => discardRun(b.root, snap, quarantine())).toThrow();
      expect(existsSync(join(b.root, "locked/a.txt"))).toBe(true);
    } finally {
      chmodSync(join(b.root, "locked"), 0o755);
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

  it("rejects a rename into the allowed area and restores the deleted source", () => {
    const b = makeGitBrain({ "products/acme-docs/notes.md": "# Notes\n" });
    try {
      const snap = snapshotRun(b.root);
      mkdirSync(join(b.root, "research"), { recursive: true });
      b.git("mv", "products/acme-docs/notes.md", "research/notes.md");
      const inspected = inspectRun(b.root, snap, research);
      expect(inspected.allowed).toEqual([]);
      expect(paths(inspected.rejected)).toEqual([
        "products/acme-docs/notes.md",
        "research/notes.md",
      ]);
      discardRun(b.root, snap, quarantine());
      expect(readFileSync(join(b.root, "products/acme-docs/notes.md"), "utf8")).toBe("# Notes\n");
      expect(existsSync(join(b.root, "research/notes.md"))).toBe(false);
      expect(ownerChanges(b.root)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("rejects a rename out of the allowed area", () => {
    const b = makeGitBrain({ "research/a.md": "# A\n" });
    try {
      const snap = snapshotRun(b.root);
      b.git("mv", "research/a.md", "stolen.md");
      const inspected = inspectRun(b.root, snap, research);
      expect(inspected.allowed).toEqual([]);
      expect(inspected.rejected).toHaveLength(2);
    } finally {
      b.cleanup();
    }
  });

  it("rejects symlinks even when the name is allowed", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      mkdirSync(join(b.root, "research"), { recursive: true });
      symlinkSync("/etc/hostname", join(b.root, "research/l.md"));
      const inspected = inspectRun(b.root, snap, research);
      expect(inspected.allowed).toEqual([]);
      expect(paths(inspected.rejected)).toEqual(["research/l.md"]);
      discardRun(b.root, snap, quarantine());
      expect(existsSync(join(b.root, "research/l.md"))).toBe(false);
      expect(existsSync("/etc/hostname")).toBe(true);
    } finally {
      b.cleanup();
    }
  });

  it("rejects a nested .git directory under an allowed area", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      write(b, "research/sub/.git/x", "x");
      const inspected = inspectRun(b.root, snap, research);
      expect(inspected.allowed).toEqual([]);
      expect(inspected.rejected.map((c) => c.path)).toContain("research/sub/.git");
      discardRun(b.root, snap, quarantine());
      expect(existsSync(join(b.root, "research/sub/.git"))).toBe(false);
    } finally {
      b.cleanup();
    }
  });
});

describe("snapshot safety", () => {
  it("refuses to snapshot a brain with uncommitted changes", () => {
    const b = makeGitBrain({});
    try {
      write(b, "owner.md");
      expect(() => snapshotRun(b.root)).toThrow("brain has uncommitted changes");
    } finally {
      b.cleanup();
    }
  });

  it("leaves the owner's pre-existing nested repo alone", () => {
    const b = makeGitBrain({ ".gitignore": "vendor/\nresearch/clone/\n" });
    try {
      for (const dir of ["vendor/tool", "research/clone"]) {
        mkdirSync(join(b.root, dir), { recursive: true });
        execFileSync("git", ["init", "-q", join(b.root, dir)]);
      }
      const snap = snapshotRun(b.root);
      expect(inspectRun(b.root, snap, research).rejected).toEqual([]);
      write(b, "stray.txt");
      discardRun(b.root, snap, quarantine());
      expect(existsSync(join(b.root, "vendor/tool/.git"))).toBe(true);
      expect(existsSync(join(b.root, "research/clone/.git"))).toBe(true);
      expect(existsSync(join(b.root, "stray.txt"))).toBe(false);
    } finally {
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
      expect(inspectRun(b.root, snap, research).gitTampered).toEqual([
        ".git/config",
        ".git/info/attributes",
      ]);
      discardRun(b.root, snap, quarantine());
      expect(readFileSync(join(b.root, ".git/config"))).toEqual(config);
      expect(existsSync(join(b.root, ".git/info/attributes"))).toBe(false);
      expect(inspectRun(b.root, snap, research).gitTampered).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("reports a rewound ref", () => {
    const b = makeGitBrain({});
    try {
      write(b, "n.md");
      commitChanges(b.root, ["n.md"], "second");
      const snap = snapshotRun(b.root);
      b.git("update-ref", "refs/heads/main", "HEAD~1");
      expect(inspectRun(b.root, snap, research).gitTampered).toEqual([".git/refs/heads/main"]);
    } finally {
      b.cleanup();
    }
  });

  it("quarantines new and modified files before discarding them", () => {
    const b = makeGitBrain({ "notes/old.md": "# Old\n" });
    try {
      const snap = snapshotRun(b.root);
      write(b, "notes/mid-run.md", "# Written by the owner mid-run\n");
      write(b, "notes/old.md", "# Edited mid-run\n");
      symlinkSync("/etc/hostname", join(b.root, "link.md"));
      const dir = quarantine();
      const { quarantined } = discardRun(b.root, snap, dir);
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

  it("refuses a quarantine directory inside the brain", () => {
    const b = makeGitBrain({});
    try {
      const snap = snapshotRun(b.root);
      expect(() => discardRun(b.root, snap, join(b.root, "q"))).toThrow();
    } finally {
      b.cleanup();
    }
  });

  it("rejects a new ignored file inside an allowed area", () => {
    const b = makeGitBrain({ ".gitignore": "research/hidden/\n" });
    try {
      const snap = snapshotRun(b.root);
      write(b, "research/hidden/x.md");
      const inspected = inspectRun(b.root, snap, research);
      expect(inspected.allowed).toEqual([]);
      expect(paths(inspected.rejected)).toEqual(["research/hidden/x.md"]);
    } finally {
      b.cleanup();
    }
  });
});

describe("push", () => {
  it("reports a push failure instead of throwing", () => {
    const b = makeGitBrain({});
    try {
      b.git("remote", "set-url", "origin", "/nonexistent/remote.git");
      write(b, "x.md", "# x\n");
      commitChanges(b.root, ["x.md"], "x");
      expect(pushBrain(b.root).ok).toBe(false);
    } finally {
      b.cleanup();
    }
  });

  it("redacts greedy credentials", () => {
    expect(redactCredentials("https://user:p@ss@example.com/x")).toBe("https://***@example.com/x");
  });

  it("strips credentials from push errors", () => {
    expect(
      redactCredentials("fatal: unable to access 'https://user:s3cret@example.com/x.git'"),
    ).not.toContain("s3cret");
    const b = makeGitBrain({});
    try {
      b.git("remote", "set-url", "origin", "https://user:s3cret@127.0.0.1:1/x.git");
      write(b, "x.md", "# x\n");
      commitChanges(b.root, ["x.md"], "x");
      const result = pushBrain(b.root);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("s3cret");
    } finally {
      b.cleanup();
    }
  });
});
