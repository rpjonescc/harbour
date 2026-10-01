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

  it("rejects a directory whose name ends in .md", () => {
    mkdirSync(join(brain.root, "folder.md"));
    expect(() => resolveBrainPath(brain.root, "folder.md")).toThrow(BrainPathError);
  });
});
