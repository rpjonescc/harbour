import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGitBrain } from "@/tests/helpers/git-brain";
import { OUTSIDE_BRAIN } from "./attribution";
import { discardRun } from "./brain-discard";
import { inspectRun, snapshotRun } from "./brain-git";

// The owner keeps editing the brain while an agent runs: only the agent's own writes are gated.
const research = { prefixes: ["research/"], exact: ["00-start-here.md"] };
type Brain = ReturnType<typeof makeGitBrain>;

const quarantines: string[] = [];
const quarantine = () => {
  const dir = mkdtempSync(join(tmpdir(), "harbour-quarantine-"));
  quarantines.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of quarantines.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(b: Brain, path: string, content = "x\n") {
  mkdirSync(join(b.root, path.split("/").slice(0, -1).join("/") || "."), { recursive: true });
  writeFileSync(join(b.root, path), content);
}
const paths = (changes: { path: string }[]) => changes.map((c) => c.path).sort();

/** A brain with an owner note, snapshotted, then edited concurrently by owner and agent. */
function concurrentRun(agentPath: string) {
  const b = makeGitBrain({ "notes/owner.md": "# Owner\n" });
  const snap = snapshotRun(b.root);
  write(b, agentPath, "# Agent\n");
  write(b, "notes/owner.md", "# Owner, edited mid-run\n");
  write(b, "notes/new-idea.md", "# A new idea\n");
  return { b, snap, touched: new Set([agentPath]) };
}

describe("inspectRun with agent attribution", () => {
  it("gates only the agent's writes and leaves the owner's changes aside", () => {
    const { b, snap, touched } = concurrentRun("research/geo/a.md");
    try {
      const inspected = inspectRun(b.root, snap, research, touched);
      expect(paths(inspected.allowed)).toEqual(["research/geo/a.md"]);
      expect(paths(inspected.owner)).toEqual(["notes/new-idea.md", "notes/owner.md"]);
      expect(inspected.rejected).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("still rejects an agent write outside its area", () => {
    const { b, snap, touched } = concurrentRun("products/acme-docs/notes.md");
    try {
      const inspected = inspectRun(b.root, snap, research, touched);
      expect(paths(inspected.rejected)).toEqual(["products/acme-docs/notes.md"]);
      expect(paths(inspected.owner)).toEqual(["notes/new-idea.md", "notes/owner.md"]);
    } finally {
      b.cleanup();
    }
  });

  it("rejects a write the agent aimed outside the brain", () => {
    const { b, snap } = concurrentRun("research/geo/a.md");
    try {
      const attempt = `${OUTSIDE_BRAIN}: /etc/x.md`;
      const touched = new Set(["research/geo/a.md", attempt]);
      expect(paths(inspectRun(b.root, snap, research, touched).rejected)).toEqual([attempt]);
    } finally {
      b.cleanup();
    }
  });

  it("treats every change as the agent's when its writes are unknown", () => {
    const { b, snap } = concurrentRun("research/geo/a.md");
    try {
      const inspected = inspectRun(b.root, snap, research, "all");
      expect(paths(inspected.rejected)).toEqual(["notes/new-idea.md", "notes/owner.md"]);
      expect(inspected.owner).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it("always checks new ignored files and nested repos, touched or not", () => {
    const b = makeGitBrain({ ".gitignore": "*.local\n" });
    try {
      const snap = snapshotRun(b.root);
      write(b, "research/hidden.local");
      write(b, "research/sub/.git/HEAD", "ref: refs/heads/main\n");
      const inspected = inspectRun(b.root, snap, research, new Set());
      expect(paths(inspected.rejected)).toEqual(
        expect.arrayContaining(["research/hidden.local", "research/sub/.git"]),
      );
    } finally {
      b.cleanup();
    }
  });
});

describe("discardRun with agent attribution", () => {
  it("discards the agent's writes and leaves the owner's changes byte-for-byte", () => {
    const { b, snap, touched } = concurrentRun("research/geo/a.md");
    try {
      write(b, "README.md", "# Brain, edited by the owner\n");
      touched.add("README.md"); // the agent also edited a tracked file
      write(b, "README.md", "# Brain, edited by the agent\n");
      const dir = quarantine();
      const { quarantined } = discardRun(b.root, snap, dir, touched);
      expect(quarantined.sort()).toEqual(["README.md", "research/geo/a.md"]);
      expect(readFileSync(join(b.root, "README.md"), "utf8")).toBe("# Brain\n");
      expect(readFileSync(join(b.root, "notes/owner.md"), "utf8")).toBe(
        "# Owner, edited mid-run\n",
      );
      expect(readFileSync(join(b.root, "notes/new-idea.md"), "utf8")).toBe("# A new idea\n");
      expect(b.git("status", "--porcelain", "--untracked-files=all").split("\n").sort()).toEqual([
        "",
        " M notes/owner.md",
        "?? notes/new-idea.md",
      ]);
    } finally {
      b.cleanup();
    }
  });

  it("discards everything when the agent's writes are unknown", () => {
    const { b, snap } = concurrentRun("research/geo/a.md");
    try {
      discardRun(b.root, snap, quarantine(), "all");
      expect(b.git("status", "--porcelain")).toBe("");
    } finally {
      b.cleanup();
    }
  });
});
