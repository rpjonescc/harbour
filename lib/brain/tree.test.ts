import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { filePaths, listTree } from "./tree";

describe("listTree", () => {
  it("lists markdown files, folders first, skipping hidden entries, other files and empty folders", () => {
    const brain = makeBrain({
      "b.md": "",
      "a.md": "",
      "research/z.md": "",
      "research/seo/y.md": "",
      ".git/config.md": "",
      "inbox/.gitkeep": "",
      "image.png": "",
    });
    try {
      const { nodes, truncated } = listTree(brain.root);
      expect(truncated).toBe(false);
      expect(nodes.map((n) => n.name)).toEqual(["research", "a.md", "b.md"]);
      expect(filePaths(nodes)).toEqual(["research/seo/y.md", "research/z.md", "a.md", "b.md"]);
    } finally {
      brain.cleanup();
    }
  });

  it("skips symlinks", () => {
    const brain = makeBrain({ "a.md": "" });
    try {
      symlinkSync(join(brain.root, "a.md"), join(brain.root, "link.md"));
      expect(filePaths(listTree(brain.root).nodes)).toEqual(["a.md"]);
    } finally {
      brain.cleanup();
    }
  });

  it("stops at the limit and reports truncation", () => {
    const brain = makeBrain({ "a.md": "", "b.md": "", "c.md": "" });
    try {
      const { nodes, truncated } = listTree(brain.root, 2);
      expect(filePaths(nodes)).toHaveLength(2);
      expect(truncated).toBe(true);
    } finally {
      brain.cleanup();
    }
  });

  it("is not truncated when exactly the limit of documents exists", () => {
    const brain = makeBrain({ "a.md": "", "b.md": "", "c.txt": "", "zz/notes.txt": "" });
    try {
      const { nodes, truncated } = listTree(brain.root, 2);
      expect(filePaths(nodes)).toEqual(["a.md", "b.md"]);
      expect(truncated).toBe(false);
    } finally {
      brain.cleanup();
    }
  });

  it("looks inside later folders before reporting truncation", () => {
    const more = makeBrain({ "a/x.md": "", "b/y.md": "" });
    const none = makeBrain({ "a/x.md": "", "b/y.txt": "" });
    try {
      expect(listTree(more.root, 1).truncated).toBe(true);
      const exact = listTree(none.root, 1);
      expect(filePaths(exact.nodes)).toEqual(["a/x.md"]);
      expect(exact.truncated).toBe(false);
    } finally {
      more.cleanup();
      none.cleanup();
    }
  });

  it("counts only Markdown files toward the document limit", () => {
    const brain = makeBrain({ "a.txt": "", "b.txt": "", "c.txt": "", "x.md": "", "y.md": "" });
    try {
      const { nodes, truncated } = listTree(brain.root, 2);
      expect(filePaths(nodes)).toEqual(["x.md", "y.md"]);
      expect(truncated).toBe(false);
    } finally {
      brain.cleanup();
    }
  });

  it("bounds directory-heavy trees even when they contain no Markdown", () => {
    const brain = makeBrain({
      "a/one.txt": "",
      "b/two.txt": "",
      "c/three.txt": "",
      "d/four.txt": "",
    });
    try {
      const result = listTree(brain.root, 5000, 3);
      expect(result.nodes).toEqual([]);
      expect(result.truncated).toBe(true);
    } finally {
      brain.cleanup();
    }
  });

  it("bounds nesting depth", () => {
    const nested = `${Array.from({ length: 70 }, (_, i) => `d${i}`).join("/")}/note.md`;
    const brain = makeBrain({ [nested]: "# Deep" });
    try {
      const result = listTree(brain.root);
      expect(result.truncated).toBe(true);
      expect(filePaths(result.nodes)).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });
});
