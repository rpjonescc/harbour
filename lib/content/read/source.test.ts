import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderFile } from "@/lib/content/files";
import { makeBrain } from "@/tests/helpers/brain";
import { readSource } from "./source";

const ID = "acme-docs-20261002-five-minutes";
const PATH = `content/pieces/${ID}/source.md`;
const front = (paragraphs: string[]) => ({
  title: "Five minutes",
  kind: "content-source",
  ideaId: ID,
  productId: "acme-docs",
  paragraphs,
  facts: ["product:acme-docs"],
  createdBy: "job-3",
  skills: [],
});
const file = (paragraphs: string[], body: string) => renderFile(front(paragraphs), body);

describe("readSource", () => {
  it("reads the front matter and one paragraph per id, in order", () => {
    const { root, cleanup } = makeBrain({
      [PATH]: file(["p1", "p2"], "First paragraph.\n\nSecond one."),
    });
    try {
      const source = readSource(root, ID);
      expect(source?.paragraphs).toEqual([
        { id: "p1", text: "First paragraph." },
        { id: "p2", text: "Second one." },
      ]);
      expect(source?.front.questions).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("is null when there is no source", () => {
    const { root, cleanup } = makeBrain({});
    try {
      expect(readSource(root, ID)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it.each([
    ["a body that does not match its ids", file(["p1", "p2"], "Only one.")],
    ["not a source file", "just text"],
    ["a different kind of file", renderFile({ ...front(["p1"]), kind: "content-idea" }, "x")],
    ["an oversized file", file(["p1"], "x".repeat(200 * 1024))],
  ])("is null for %s", (_label, text) => {
    const { root, cleanup } = makeBrain({ [PATH]: text });
    try {
      expect(readSource(root, ID)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("is null for a file that is not UTF-8 and for a symlink", () => {
    const { root, cleanup } = makeBrain({ "real.md": file(["p1"], "Fine.") });
    try {
      mkdirSync(dirname(join(root, PATH)), { recursive: true });
      writeFileSync(
        join(root, PATH),
        Buffer.concat([Buffer.from(file(["p1"], "Bad ")), Buffer.from([0xff])]),
      );
      expect(readSource(root, ID)).toBeNull();
      writeFileSync(join(root, "other.md"), file(["p1"], "Fine."));
      mkdirSync(dirname(join(root, PATH.replace(ID, `${ID}-b`))), { recursive: true });
      symlinkSync(join(root, "other.md"), join(root, PATH.replace(ID, `${ID}-b`)));
      expect(readSource(root, `${ID}-b`)).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("refuses an id that is not an idea id", () => {
    const { root, cleanup } = makeBrain({});
    try {
      expect(() => readSource(root, "../x")).toThrow();
    } finally {
      cleanup();
    }
  });
});
