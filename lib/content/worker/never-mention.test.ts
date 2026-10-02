import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { readNeverMention } from "./never-mention";

describe("readNeverMention", () => {
  it("reads one term per line, with or without a dash, and skips blanks and comments", () => {
    const { root, cleanup } = makeBrain({
      "content/never-mention.md": "# Never mention\n\n- Project Zephyr\nOld Client Ltd\n\n- x\n",
    });
    try {
      expect(readNeverMention(root)).toEqual(["Project Zephyr", "Old Client Ltd"]);
    } finally {
      cleanup();
    }
  });

  it("is empty when the file is missing", () => {
    const { root, cleanup } = makeBrain({});
    try {
      expect(readNeverMention(root)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("keeps at most 200 terms and ignores terms over 60 characters", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `term number ${i}`);
    const { root, cleanup } = makeBrain({
      "content/never-mention.md": `${"y".repeat(61)}\n${lines.join("\n")}\n`,
    });
    try {
      const terms = readNeverMention(root);
      expect(terms).toHaveLength(200);
      expect(terms[0]).toBe("term number 0");
    } finally {
      cleanup();
    }
  });

  it("fails rather than reading a list that is too large as an empty one", () => {
    const { root, cleanup } = makeBrain({
      "content/never-mention.md": "a\n".repeat(20 * 1024),
    });
    try {
      expect(() => readNeverMention(root)).toThrow(/too large or not a plain file/);
    } finally {
      cleanup();
    }
  });

  it("fails when the list is a symlink or a directory", () => {
    const a = makeBrain({ "content/real.md": "Secret Name\n" });
    const b = makeBrain({});
    try {
      symlinkSync(join(a.root, "content/real.md"), join(a.root, "content/never-mention.md"));
      expect(() => readNeverMention(a.root)).toThrow(/not a plain file/);
      mkdirSync(join(b.root, "content/never-mention.md"), { recursive: true });
      expect(() => readNeverMention(b.root)).toThrow(/not a plain file/);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});
