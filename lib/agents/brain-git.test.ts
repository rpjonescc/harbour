import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import {
  changedPaths,
  commitChanges,
  isAllowedChange,
  partitionChanges,
  pushBrain,
  restoreChanges,
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
