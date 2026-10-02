import { execFileSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { readNoteBytes, readPrefixBytes } from "./bounded-read";
import { MAX_NOTE_BYTES } from "./file";

describe("readNoteBytes", () => {
  const read = (name: string, content: string | null, link?: string) => {
    const brain = makeBrain({});
    try {
      if (content !== null) writeFileSync(join(brain.root, name), content);
      if (link) symlinkSync(join(brain.root, name), join(brain.root, link));
      return readNoteBytes(join(brain.root, link ?? name));
    } finally {
      brain.cleanup();
    }
  };

  it("returns the bytes of a small file, exactly", () => {
    expect(read("a.md", "hello café")?.toString("utf8")).toBe("hello café");
    expect(read("empty.md", "")?.length).toBe(0);
  });

  it("accepts a file of exactly the cap, and refuses one byte more", () => {
    expect(read("a.md", "a".repeat(MAX_NOTE_BYTES))?.length).toBe(MAX_NOTE_BYTES);
    expect(read("a.md", "a".repeat(MAX_NOTE_BYTES + 1))).toBeNull();
    expect(read("big.md", "a".repeat(5_000_000))).toBeNull();
  });

  it("never follows a symlink", () => {
    expect(read("target.md", "hello", "link.md")).toBeNull();
  });

  it("propagates a missing file", () => {
    expect(() => read("missing.md", null)).toThrow(/ENOENT/);
  });
});

describe("readPrefixBytes", () => {
  const withFiles = <T>(run: (root: string) => T): T => {
    const brain = makeBrain({ "a.md": "hello café", "big.md": "a".repeat(10_000) });
    try {
      symlinkSync(join(brain.root, "a.md"), join(brain.root, "link.md"));
      execFileSync("mkfifo", [join(brain.root, "pipe.md")]);
      return run(brain.root);
    } finally {
      brain.cleanup();
    }
  };

  it("returns a small file whole and a long one cut at the cap, saying so", () => {
    withFiles((root) => {
      expect(readPrefixBytes(join(root, "a.md"), 100)).toMatchObject({ truncated: false });
      expect(readPrefixBytes(join(root, "a.md"), 100).bytes.toString("utf8")).toBe("hello café");
      const cut = readPrefixBytes(join(root, "big.md"), 6144);
      expect(cut.bytes.length).toBe(6144);
      expect(cut.truncated).toBe(true);
      expect(readPrefixBytes(join(root, "big.md"), 10_000).truncated).toBe(false);
    });
  });

  it("refuses a symlink, a FIFO (without waiting) and a directory, and propagates a missing file", () => {
    withFiles((root) => {
      expect(() => readPrefixBytes(join(root, "link.md"), 100)).toThrow(/ELOOP/);
      expect(() => readPrefixBytes(join(root, "pipe.md"), 100)).toThrow(/regular file/);
      expect(() => readPrefixBytes(root, 100)).toThrow();
      expect(() => readPrefixBytes(join(root, "none.md"), 100)).toThrow(/ENOENT/);
    });
  });
});
