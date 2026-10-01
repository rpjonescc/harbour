import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { checkBrainRoot, readDoc, titleFor } from "./docs";

describe("titleFor", () => {
  it("prefers frontmatter title, then first heading, then file name", () => {
    expect(titleFor("a/x.md", { title: "Front" }, "# Heading")).toBe("Front");
    expect(titleFor("a/x.md", {}, "intro\n# Heading\n")).toBe("Heading");
    expect(titleFor("a/glossary.md", {}, "no heading")).toBe("glossary");
  });
});

describe("readDoc", () => {
  it("reads a document with its parsed parts", () => {
    const brain = makeBrain({ "research/a.md": "---\ntags: [seo]\n---\n# Alpha\nText" });
    try {
      const doc = readDoc(brain.root, "research/a.md");
      expect(doc).toMatchObject({
        path: "research/a.md",
        title: "Alpha",
        frontmatter: { tags: ["seo"] },
        body: "# Alpha\nText",
        frontmatterError: null,
      });
      expect(doc.mtime).toBeInstanceOf(Date);
    } finally {
      brain.cleanup();
    }
  });
});

describe("checkBrainRoot", () => {
  it("distinguishes ok, missing and not-a-directory", () => {
    const brain = makeBrain({});
    try {
      writeFileSync(join(brain.root, "file"), "x");
      expect(checkBrainRoot(brain.root)).toEqual({ ok: true });
      expect(checkBrainRoot(join(brain.root, "nope"))).toEqual({ ok: false, reason: "missing" });
      expect(checkBrainRoot(join(brain.root, "file"))).toEqual({
        ok: false,
        reason: "not-directory",
      });
    } finally {
      brain.cleanup();
    }
  });

  it("reports an unreadable brain root", () => {
    const brain = makeBrain({});
    const unreadable = join(brain.root, "private");
    mkdirSync(unreadable);
    chmodSync(unreadable, 0o000);
    try {
      expect(checkBrainRoot(unreadable)).toEqual({ ok: false, reason: "unreadable" });
    } finally {
      chmodSync(unreadable, 0o700);
      brain.cleanup();
    }
  });
});
