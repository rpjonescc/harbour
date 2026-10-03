import { utimesSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { openTestDb } from "@/tests/helpers/db";
import { reindexAll } from "./indexer";
import { backlinks, brainStats, isNewDoc, markViewed, newDocPaths, recentDocs } from "./views";

describe("view state", () => {
  it("treats never-viewed and changed-since-viewed documents as new", () => {
    const brain = makeBrain({ "a.md": "# A", "b.md": "# B links [[a]]" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      expect([...newDocPaths(db)].sort()).toEqual(["a.md", "b.md"]);
      markViewed(db, "a.md", new Date(Date.now() + 60_000));
      expect([...newDocPaths(db)]).toEqual(["b.md"]);
      // Titles come verbatim from the first heading when there is no frontmatter title.
      expect(backlinks(db, "a.md")).toEqual([{ path: "b.md", title: "B links [[a]]" }]);
      expect(recentDocs(db, 1)).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("marks a touched document new even when its content is unchanged", () => {
    const brain = makeBrain({ "a.md": "# A" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      const viewedAt = new Date(Date.now() + 60_000);
      markViewed(db, "a.md", viewedAt);
      const changedAt = new Date(viewedAt.getTime() + 60_000);
      utimesSync(join(brain.root, "a.md"), changedAt, changedAt);
      expect(reindexAll(db, brain.root)).toEqual({ indexed: 0, removed: 0, skipped: [] });
      expect([...newDocPaths(db)]).toEqual(["a.md"]);
    } finally {
      brain.cleanup();
    }
  });

  it("reports whether one document is new", () => {
    const brain = makeBrain({ "a.md": "# A" });
    const db = openTestDb();
    try {
      reindexAll(db, brain.root);
      expect(isNewDoc(db, "a.md")).toBe(true);
      markViewed(db, "a.md", new Date(Date.now() + 60_000));
      expect(isNewDoc(db, "a.md")).toBe(false);
      expect(isNewDoc(db, "missing.md")).toBe(false);
    } finally {
      brain.cleanup();
    }
  });
});

describe("brainStats", () => {
  it("counts the notes and finds the newest change, or none in an empty index", () => {
    const db = openTestDb();
    expect(brainStats(db)).toEqual({ notes: 0, newest: null });
    const brain = makeBrain({ "a.md": "# A", "b.md": "# B" });
    try {
      const later = new Date("2026-10-03T08:00:00Z");
      utimesSync(join(brain.root, "b.md"), later, later);
      utimesSync(
        join(brain.root, "a.md"),
        new Date("2026-10-01T08:00:00Z"),
        new Date("2026-10-01T08:00:00Z"),
      );
      reindexAll(db, brain.root);
      const stats = brainStats(db);
      expect(stats.notes).toBe(2);
      expect(stats.newest?.getTime()).toBe(later.getTime());
    } finally {
      brain.cleanup();
    }
  });
});
