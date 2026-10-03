import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brainDocs } from "@/lib/db/schema";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { searchBrain } from "./search";

// The listing saw a plain file at "swapped.md"; by the time it is read it is a symlink.
const listing = vi.hoisted(() => ({ extra: null as string | null }));
vi.mock("./tree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tree")>();
  return {
    ...actual,
    listTree: (root: string, limit?: number) => {
      const tree = actual.listTree(root, limit);
      const extra = listing.extra;
      if (extra === null) return tree;
      return {
        ...tree,
        nodes: [...tree.nodes, { kind: "file" as const, path: extra, name: extra }],
      };
    },
  };
});

describe("reindexAll and a file swapped for a symlink after listing", () => {
  it("never reads through the symlink, and reports the file as skipped", () => {
    const brain = makeBrain({ "a.md": "# A\nalpha" });
    const outside = mkdtempSync(join(tmpdir(), "harbour-outside-"));
    const db = openTestDb();
    try {
      writeFileSync(join(outside, "secret.md"), "# Secret\nzanzibar private words\n");
      symlinkSync(join(outside, "secret.md"), join(brain.root, "swapped.md"));
      listing.extra = "swapped.md";
      const result = reindexAll(db, brain.root);
      expect(result.skipped).toEqual(["swapped.md"]);
      expect(searchBrain(db, "zanzibar")).toEqual([]);
      expect(db.select({ path: brainDocs.path }).from(brainDocs).all()).toEqual([{ path: "a.md" }]);
    } finally {
      listing.extra = null;
      brain.cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
