import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { ideaFile } from "@/tests/helpers/content";
import { countWaitingIdeas, ideaFileIds, readIdeas } from "./ideas";

const DIR = "content/ideas/acme-docs";

describe("readIdeas", () => {
  it("lists valid ideas newest first, and names the files it could not read", () => {
    const { root, cleanup } = makeBrain({
      [`${DIR}/acme-docs-20261001-a.md`]: ideaFile({ created: "2026-10-01" }),
      [`${DIR}/acme-docs-20261002-b.md`]: ideaFile(),
      [`${DIR}/acme-docs-20261003-c.md`]: "no frontmatter",
    });
    try {
      const { ideas, unreadable } = readIdeas(root, "acme-docs");
      expect(ideas.map((i) => i.id)).toEqual(["acme-docs-20261002-b", "acme-docs-20261001-a"]);
      expect(unreadable).toEqual([`${DIR}/acme-docs-20261003-c.md`]);
    } finally {
      cleanup();
    }
  });

  it("is empty for a product with no folder, and counts only ideas still waiting", () => {
    const { root, cleanup } = makeBrain({
      [`${DIR}/acme-docs-20261001-a.md`]: ideaFile(),
      [`${DIR}/acme-docs-20261001-b.md`]: ideaFile({ state: "drafted" }),
      [`${DIR}/acme-docs-20261001-c.md`]: ideaFile({ state: "discarded" }),
    });
    try {
      expect(readIdeas(root, "lighthouse-cafe")).toEqual({ ideas: [], unreadable: [] });
      expect(countWaitingIdeas(root, "acme-docs")).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("names, and never reads through, a symlink, a FIFO, an oversize file, a bad id and another product's idea", () => {
    const { root, cleanup } = makeBrain({
      "outside.md": ideaFile(),
      [`${DIR}/acme-docs-20261001-big.md`]: `${ideaFile()}${"x".repeat(40_000)}`,
      [`${DIR}/acme-docs-20261001-other.md`]: ideaFile({ productId: "lighthouse-cafe" }),
      [`${DIR}/Bad Name.md`]: ideaFile(),
      [`${DIR}/acme-docs-20261001-ok.md`]: ideaFile(),
    });
    try {
      symlinkSync(join(root, "outside.md"), join(root, DIR, "acme-docs-20261001-link.md"));
      execFileSync("mkfifo", [join(root, DIR, "acme-docs-20261001-pipe.md")]);
      mkdirSync(join(root, DIR, "acme-docs-20261001-dir.md"));
      const { ideas, unreadable } = readIdeas(root, "acme-docs");
      expect(ideas.map((i) => i.id)).toEqual(["acme-docs-20261001-ok"]);
      expect(unreadable).toHaveLength(6);
      expect(countWaitingIdeas(root, "acme-docs")).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("lists every idea file name, readable or not, for the never-overwrite check", () => {
    const { root, cleanup } = makeBrain({
      [`${DIR}/acme-docs-20261001-a.md`]: "owner is mid-edit",
      [`${DIR}/notes.txt`]: "not an idea file",
    });
    try {
      expect([...ideaFileIds(root, "acme-docs")]).toEqual(["acme-docs-20261001-a"]);
      expect(ideaFileIds(root, "lighthouse-cafe").size).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("stops at the limit, keeping the newest", () => {
    const { root, cleanup } = makeBrain({
      [`${DIR}/acme-docs-20261001-a.md`]: ideaFile({ created: "2026-10-01" }),
      [`${DIR}/acme-docs-20261002-b.md`]: ideaFile(),
    });
    try {
      expect(readIdeas(root, "acme-docs", 1).ideas.map((i) => i.id)).toEqual([
        "acme-docs-20261002-b",
      ]);
    } finally {
      cleanup();
    }
  });

  it("fails loudly when the ideas folder cannot be listed", () => {
    const { root, cleanup } = makeBrain({ [DIR]: "a file, not a folder" });
    try {
      expect(() => readIdeas(root, "acme-docs")).toThrow();
    } finally {
      cleanup();
    }
  });
});
