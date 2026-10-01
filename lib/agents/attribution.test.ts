import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  brainRelativePath,
  isAgentChange,
  isOutsideBrain,
  OUTSIDE_BRAIN,
  UNKNOWN_TOUCH,
} from "./attribution";

describe("brainRelativePath", () => {
  let base: string;
  let root: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "harbour-attr-"));
    root = join(base, "brain");
    mkdirSync(join(root, "research"), { recursive: true });
    mkdirSync(join(root, "products/acme-docs"), { recursive: true });
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("maps absolute paths inside the brain, existing or not", () => {
    expect(brainRelativePath(root, join(root, "research/a.md"))).toBe("research/a.md");
    expect(brainRelativePath(root, join(root, "research/new/deep/b.md"))).toBe(
      "research/new/deep/b.md",
    );
    expect(brainRelativePath(root, join(root, "research/../products/acme-docs/c.md"))).toBe(
      "products/acme-docs/c.md",
    );
  });

  it("marks paths outside the brain, naming the attempted path", () => {
    expect(brainRelativePath(root, "/etc/passwd")).toBe(`${OUTSIDE_BRAIN}: /etc/passwd`);
    expect(isOutsideBrain(brainRelativePath(root, join(base, "other/x.md")))).toBe(true);
    expect(isOutsideBrain(brainRelativePath(root, join(root, "../escape.md")))).toBe(true);
    expect(isOutsideBrain(brainRelativePath(root, root))).toBe(true);
    expect(isOutsideBrain("research/a.md")).toBe(false);
    const long = brainRelativePath(root, `/tmp/${"x".repeat(500)}`);
    expect(isOutsideBrain(long) && long.length).toBeLessThan(260);
  });

  it("treats a non-absolute path as unknown: it may not resolve where the tool wrote", () => {
    expect(brainRelativePath(root, "~/brain/research/a.md")).toBe(UNKNOWN_TOUCH);
    expect(brainRelativePath(root, "research/a.md")).toBe(UNKNOWN_TOUCH);
    expect(brainRelativePath(root, "../escape.md")).toBe(UNKNOWN_TOUCH);
  });

  it("treats a write to a symlink (dangling or not) as unknown", () => {
    symlinkSync(join(base, "nowhere.md"), join(root, "research/dangling.md"));
    expect(brainRelativePath(root, join(root, "research/dangling.md"))).toBe(UNKNOWN_TOUCH);
    symlinkSync(join(root, "products/acme-docs"), join(root, "research/dirlink"));
    expect(brainRelativePath(root, join(root, "research/dirlink"))).toBe(UNKNOWN_TOUCH);
  });

  it("treats a path that is not NFC-normalised as unknown", () => {
    expect(brainRelativePath(root, join(root, "research/cafe\u0301.md"))).toBe(UNKNOWN_TOUCH);
    expect(brainRelativePath(root, join(root, "research/caf\u00e9.md"))).toBe(
      "research/caf\u00e9.md",
    );
  });

  it("follows a symlinked directory to the real git path", () => {
    symlinkSync(join(root, "products/acme-docs"), join(root, "research/link"));
    expect(brainRelativePath(root, join(root, "research/link/notes.md"))).toBe(
      "products/acme-docs/notes.md",
    );
    symlinkSync(join(base, "elsewhere"), join(root, "research/out"));
    mkdirSync(join(base, "elsewhere"));
    expect(isOutsideBrain(brainRelativePath(root, join(root, "research/out/x.md")))).toBe(true);
  });

  it("works when the brain itself is reached through a symlink", () => {
    const alias = join(base, "alias");
    symlinkSync(root, alias);
    expect(brainRelativePath(alias, join(realpathSync(root), "research/a.md"))).toBe(
      "research/a.md",
    );
    expect(brainRelativePath(alias, join(alias, "research/a.md"))).toBe("research/a.md");
  });
});

describe("isAgentChange", () => {
  const touched = new Set(["research/a.md", "research/x/y.md"]);
  it("attributes touched paths, either rename half and touched files under a directory entry", () => {
    expect(isAgentChange({ path: "research/a.md" }, touched)).toBe(true);
    expect(isAgentChange({ path: "notes/b.md" }, touched)).toBe(false);
    expect(isAgentChange({ path: "notes/b.md", pair: "research/a.md" }, touched)).toBe(true);
    expect(isAgentChange({ path: "research/x/" }, touched)).toBe(true);
    expect(isAgentChange({ path: "research/z/" }, touched)).toBe(false);
  });
  it("attributes a gitlink (no trailing slash) the agent wrote inside", () => {
    expect(isAgentChange({ path: "research/x" }, touched)).toBe(true);
    expect(isAgentChange({ path: "research/xy" }, new Set(["research/xyz/a.md"]))).toBe(false);
  });
  it("attributes everything when the touched set is unknown", () => {
    expect(isAgentChange({ path: "notes/b.md" }, "all")).toBe(true);
  });
});
