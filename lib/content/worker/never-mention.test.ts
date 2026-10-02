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

  it("fails, with a fixed sentence, on a term over 60 characters", () => {
    const secret = `Project ${"Zephyr".repeat(11)}`;
    const { root, cleanup } = makeBrain({ "content/never-mention.md": `${secret}\nOld Client\n` });
    try {
      expect(() => readNeverMention(root)).toThrow(/over 60 characters, so no digest was made/);
      expect(() => readNeverMention(root)).not.toThrow(/Zephyr/);
    } finally {
      cleanup();
    }
  });

  it("fails on more than 200 terms, and accepts exactly 200", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => `term number ${i}`).join("\n");
    const over = makeBrain({ "content/never-mention.md": list(201) });
    const exact = makeBrain({ "content/never-mention.md": list(200) });
    try {
      expect(() => readNeverMention(over.root)).toThrow(/more than 200 terms/);
      expect(readNeverMention(exact.root)).toHaveLength(200);
    } finally {
      over.cleanup();
      exact.cleanup();
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
