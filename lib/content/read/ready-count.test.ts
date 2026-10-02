import { makeBrain } from "@/tests/helpers/brain";
import { ACME, ideaFile, pieceFile } from "@/tests/helpers/content";
import { countReadyPieces } from "./ready-count";

const piece = (idea: string, platform: "linkedin" | "x" | "blog", state = "ready") => ({
  [`content/pieces/${idea}/${platform}.md`]: pieceFile(idea, platform, { state }),
});

describe("countReadyPieces", () => {
  it("counts ready pieces of drafted ideas only", () => {
    const { root, cleanup } = makeBrain({
      "content/ideas/acme-docs/acme-docs-20261002-a.md": ideaFile({ state: "drafted" }),
      "content/ideas/acme-docs/acme-docs-20261001-b.md": ideaFile({ state: "discarded" }),
      ...piece("acme-docs-20261002-a", "linkedin"),
      ...piece("acme-docs-20261002-a", "x"),
      ...piece("acme-docs-20261002-a", "blog", "needs-you"),
      ...piece("acme-docs-20261001-b", "linkedin"),
      ...piece("acme-docs-20261001-b", "x"),
    });
    try {
      expect(countReadyPieces(root, [ACME])).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("is zero when there is no content folder yet", () => {
    const { root, cleanup } = makeBrain({});
    try {
      expect(countReadyPieces(root, [ACME])).toBe(0);
    } finally {
      cleanup();
    }
  });
});
