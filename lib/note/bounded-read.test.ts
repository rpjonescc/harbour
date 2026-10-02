import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { readNoteBytes } from "./bounded-read";
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
