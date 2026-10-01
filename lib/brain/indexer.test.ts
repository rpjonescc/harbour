import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brainDocs, brainLinks } from "@/lib/db/schema";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { searchBrain } from "./search";

describe("reindexAll", () => {
  it("indexes documents, titles and links, and is incremental", () => {
    const brain = makeBrain({
      "research/glossary.md": "# Glossary\nAEO means answer engine optimisation.",
      "research/geo.md":
        "---\ntitle: GEO basics\n---\nSee [[glossary]] about Perplexity citations.",
    });
    const db = openTestDb();
    try {
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 2, removed: 0 });
      expect(
        db
          .select()
          .from(brainDocs)
          .all()
          .map((d) => d.title)
          .sort(),
      ).toEqual(["GEO basics", "Glossary"]);
      expect(db.select().from(brainLinks).all()).toEqual([
        { fromPath: "research/geo.md", toPath: "research/glossary.md" },
      ]);
      expect(searchBrain(db, "perplexity").map((h) => h.path)).toEqual(["research/geo.md"]);
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 0, removed: 0 });
    } finally {
      brain.cleanup();
    }
  });

  it("removes deleted documents from every table", () => {
    const brain = makeBrain({ "a.md": "# A\nalpha [[b]]", "b.md": "# B\nbravo" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      rmSync(join(brain.root, "b.md"));
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 0, removed: 1 });
      expect(searchBrain(db, "bravo")).toEqual([]);
      expect(db.select().from(brainLinks).all()).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("re-resolves links in unchanged documents when a target appears", () => {
    const brain = makeBrain({ "a.md": "links to [[later]]" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      expect(db.select().from(brainLinks).all()).toEqual([]);
      writeFileSync(join(brain.root, "later.md"), "# Later");
      reindexAll(db, brain.root);
      expect(db.select().from(brainLinks).all()).toEqual([
        { fromPath: "a.md", toPath: "later.md" },
      ]);
    } finally {
      brain.cleanup();
    }
  });

  it("keeps the existing index when the bounded tree is truncated", () => {
    const brain = makeBrain({ "a.md": "# A", "b.md": "# B" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      writeFileSync(join(brain.root, "0.txt"), "x");
      writeFileSync(join(brain.root, "1.txt"), "x");
      writeFileSync(join(brain.root, "2.txt"), "x");
      expect(() => reindexAll(db, brain.root, 2)).toThrow("Brain tree truncated");
      expect(db.select().from(brainDocs).all()).toHaveLength(2);
    } finally {
      brain.cleanup();
    }
  });
});
