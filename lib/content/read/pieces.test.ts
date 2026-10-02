import { makeBrain } from "@/tests/helpers/brain";
import { pieceFile } from "@/tests/helpers/content";
import { readPieces, renderGates } from "./pieces";

const IDEA = "acme-docs-20261002-x";
const dir = `content/pieces/${IDEA}`;
const entry = {
  gate: "humanizer" as const,
  order: 2 as const,
  attempt: 1 as const,
  result: "pass" as const,
  findings: [],
  questions: [],
  jobId: 1,
  at: "2026-10-02T00:00:00.000Z",
  textBefore: `sha256:${"a".repeat(64)}`,
  textAfter: `sha256:${"b".repeat(64)}`,
};

describe("readPieces", () => {
  it("returns valid pieces in platform order, each with its gate entries", () => {
    const { root, cleanup } = makeBrain({
      [`${dir}/x.md`]: pieceFile(IDEA, "x"),
      [`${dir}/linkedin.md`]: pieceFile(IDEA),
      [`${dir}/linkedin.gates.json`]: renderGates([entry]),
    });
    try {
      const { pieces, unreadable } = readPieces(root, IDEA);
      expect(pieces.map((p) => p.platform)).toEqual(["linkedin", "x"]);
      expect(pieces[0]?.gates).toHaveLength(1);
      expect(pieces[1]?.gates).toEqual([]);
      expect(unreadable).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("names a corrupt piece and a corrupt sidecar instead of hiding them or crashing", () => {
    const { root, cleanup } = makeBrain({
      [`${dir}/x.md`]: "no frontmatter",
      [`${dir}/linkedin.md`]: pieceFile(IDEA),
      [`${dir}/linkedin.gates.json`]: "{ nope",
    });
    try {
      const { pieces, unreadable } = readPieces(root, IDEA);
      expect(pieces.map((p) => p.platform)).toEqual(["linkedin"]);
      expect(pieces[0]?.gates).toEqual([]);
      expect(unreadable.sort()).toEqual([`${dir}/linkedin.gates.json`, `${dir}/x.md`]);
    } finally {
      cleanup();
    }
  });

  it("does not take one platform's file for another's, or another idea's piece for this one", () => {
    const { root, cleanup } = makeBrain({
      [`${dir}/x.md`]: pieceFile(IDEA, "facebook"),
      [`${dir}/linkedin.md`]: pieceFile("acme-docs-20261002-other"),
    });
    try {
      const { pieces, unreadable } = readPieces(root, IDEA);
      expect(pieces).toEqual([]);
      expect(unreadable.sort()).toEqual([`${dir}/linkedin.md`, `${dir}/x.md`]);
    } finally {
      cleanup();
    }
  });

  it("is empty for an idea with no pieces yet", () => {
    const { root, cleanup } = makeBrain({});
    try {
      expect(readPieces(root, IDEA)).toEqual({ pieces: [], unreadable: [] });
    } finally {
      cleanup();
    }
  });
});
