import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { gitMetaPaths, nestedGitDirs, quarantine, WALK_LIMITS } from "./brain-git-fs";

const deep = (levels: number) => Array.from({ length: levels }, () => "d").join("/");
const SMALL = { depth: 3, entries: 5 };

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});
const brain = (files: Record<string, string>) => {
  const made = makeBrain(files);
  cleanups.push(made.cleanup);
  return made.root;
};
const quarantineDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

describe("nestedGitDirs", () => {
  it("finds a nested .git and ignores the brain's own", () => {
    const root = brain({ ".git/HEAD": "x", "notes/lib/.git/HEAD": "x", "notes/a.md": "a" });
    expect(nestedGitDirs(root, [""])).toEqual(["notes/lib/.git"]);
  });

  it("refuses, never stops quietly, past the depth cap", () => {
    const root = brain({ [`${deep(WALK_LIMITS.depth + 1)}/a.md`]: "a" });
    expect(() => nestedGitDirs(root, [""])).toThrow("Folders are nested too deeply to check");
    expect(() => nestedGitDirs(brain({ [`${deep(3)}/a.md`]: "a" }), [""], SMALL)).not.toThrow();
  });

  it("refuses past the entry cap", () => {
    const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`n/${i}.md`, "x"]));
    expect(() => nestedGitDirs(brain(files), [""], SMALL)).toThrow(
      "Too many files and folders to check",
    );
  });
});

describe("gitMetaPaths", () => {
  it("lists the fixed files and every file under info/ and refs/", () => {
    const root = brain({ ".git/refs/heads/main": "x", ".git/info/exclude": "x" });
    expect(gitMetaPaths(root)).toEqual([
      ".git/config",
      ".git/HEAD",
      ".git/packed-refs",
      ".gitmodules",
      ".git/info/exclude",
      ".git/refs/heads/main",
    ]);
  });

  it("refuses refs nested past the depth cap or past the entry cap", () => {
    const tooDeep = brain({ [`.git/refs/${deep(WALK_LIMITS.depth + 1)}/x`]: "x" });
    expect(() => gitMetaPaths(tooDeep)).toThrow("Folders are nested too deeply to check");
    const many = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`.git/refs/tags/v${i}`, "x"]),
    );
    expect(() => gitMetaPaths(brain(many), SMALL)).toThrow("Too many files and folders to check");
  });
});

describe("quarantine", () => {
  it("copies a changed folder and refuses one past either cap, before anything is deleted", () => {
    const root = brain({ "a/b/c.md": "c" });
    const notes: string[] = [];
    quarantine(root, quarantineDir(), [{ path: "a/" }], notes, new Set(), SMALL);
    expect(notes).toEqual(["a/: directory", "a/b/: directory", "a/b/c.md: copied"]);

    const tooDeep = brain({ [`${deep(5)}/a.md`]: "a" });
    expect(() =>
      quarantine(tooDeep, quarantineDir(), [{ path: "d" }], [], new Set(), SMALL),
    ).toThrow("Folders are nested too deeply to check");
    const many = brain(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`n/${i}`, "x"])));
    expect(() => quarantine(many, quarantineDir(), [{ path: "n" }], [], new Set(), SMALL)).toThrow(
      "Too many files and folders to check",
    );
  });
});
