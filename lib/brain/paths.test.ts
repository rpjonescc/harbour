import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { BrainPathError, resolveBrainPath } from "./paths";

describe("resolveBrainPath", () => {
  let brain: ReturnType<typeof makeBrain>;
  beforeEach(() => {
    brain = makeBrain({ "research/geo/a.md": "# A", "notes.txt": "x", ".hidden/b.md": "# B" });
  });
  afterEach(() => brain.cleanup());

  it("resolves a markdown file inside the root", () => {
    expect(resolveBrainPath(brain.root, "research/geo/a.md")).toMatch(/research\/geo\/a\.md$/);
  });

  it.each([
    ["traversal", "../etc/passwd.md"],
    ["nested traversal", "research/../../x.md"],
    ["absolute", "/etc/passwd.md"],
    ["hidden segment", ".hidden/b.md"],
    ["empty segment", "research//a.md"],
    ["non-markdown", "notes.txt"],
    ["NUL byte", "a\0.md"],
    ["missing file", "research/nope.md"],
  ])("rejects %s", (_name, path) => {
    expect(() => resolveBrainPath(brain.root, path)).toThrow(BrainPathError);
  });

  it("rejects a symlink that escapes the root", () => {
    const outside = mkdtempSync(join(tmpdir(), "harbour-outside-"));
    writeFileSync(join(outside, "secret.md"), "# secret");
    symlinkSync(join(outside, "secret.md"), join(brain.root, "link.md"));
    try {
      expect(() => resolveBrainPath(brain.root, "link.md")).toThrow(BrainPathError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects an in-root symlink to a hidden file", () => {
    mkdirSync(join(brain.root, ".git"));
    writeFileSync(join(brain.root, ".git/config"), "[core]");
    symlinkSync(join(brain.root, ".git/config"), join(brain.root, "alias.md"));
    expect(() => resolveBrainPath(brain.root, "alias.md")).toThrow(BrainPathError);
  });

  it("rejects an in-root symlink to a non-markdown file", () => {
    symlinkSync(join(brain.root, "notes.txt"), join(brain.root, "x.md"));
    expect(() => resolveBrainPath(brain.root, "x.md")).toThrow(BrainPathError);
  });

  it("rejects a path through a symlinked directory inside the root", () => {
    symlinkSync(join(brain.root, "research"), join(brain.root, "shortcut"));
    expect(() => resolveBrainPath(brain.root, "shortcut/geo/a.md")).toThrow(BrainPathError);
  });

  it("rejects a directory whose name ends in .md", () => {
    mkdirSync(join(brain.root, "folder.md"));
    expect(() => resolveBrainPath(brain.root, "folder.md")).toThrow(BrainPathError);
  });
});
