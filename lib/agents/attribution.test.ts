import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brainRelativePath, isAgentChange, OUTSIDE_BRAIN } from "./attribution";

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

  it("maps absolute and relative paths inside the brain, existing or not", () => {
    expect(brainRelativePath(root, join(root, "research/a.md"))).toBe("research/a.md");
    expect(brainRelativePath(root, "research/new/deep/b.md")).toBe("research/new/deep/b.md");
    expect(brainRelativePath(root, join(root, "research/../products/acme-docs/c.md"))).toBe(
      "products/acme-docs/c.md",
    );
  });

  it("marks paths outside the brain", () => {
    expect(brainRelativePath(root, "../escape.md")).toBe(OUTSIDE_BRAIN);
    expect(brainRelativePath(root, join(base, "other/x.md"))).toBe(OUTSIDE_BRAIN);
    expect(brainRelativePath(root, "/etc/passwd")).toBe(OUTSIDE_BRAIN);
    expect(brainRelativePath(root, root)).toBe(OUTSIDE_BRAIN);
  });

  it("follows a symlinked directory to the real git path", () => {
    symlinkSync(join(root, "products/acme-docs"), join(root, "research/link"));
    expect(brainRelativePath(root, join(root, "research/link/notes.md"))).toBe(
      "products/acme-docs/notes.md",
    );
    symlinkSync(join(base, "elsewhere"), join(root, "research/out"));
    mkdirSync(join(base, "elsewhere"));
    expect(brainRelativePath(root, "research/out/x.md")).toBe(OUTSIDE_BRAIN);
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
  it("attributes everything when the touched set is unknown", () => {
    expect(isAgentChange({ path: "notes/b.md" }, "all")).toBe(true);
  });
});
