import { desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { brainDocs, brainLinks } from "@/lib/db/schema";

/** Records that the owner opened a document (clears its "new" badge). */
export function markViewed(db: Db, path: string, now: Date = new Date()): void {
  db.update(brainDocs).set({ lastViewedAt: now }).where(eq(brainDocs.path, path)).run();
}

/** Documents never opened, or changed since they were last opened. */
export function newDocPaths(db: Db): Set<string> {
  const rows = db
    .select({ path: brainDocs.path })
    .from(brainDocs)
    .where(or(isNull(brainDocs.lastViewedAt), gt(brainDocs.mtime, brainDocs.lastViewedAt)))
    .all();
  return new Set(rows.map((row) => row.path));
}

/** Documents that wiki-link to `path`, by title. */
export function backlinks(db: Db, path: string): { path: string; title: string }[] {
  return db
    .select({ path: brainDocs.path, title: brainDocs.title })
    .from(brainLinks)
    .innerJoin(brainDocs, eq(brainLinks.fromPath, brainDocs.path))
    .where(eq(brainLinks.toPath, path))
    .orderBy(brainDocs.title)
    .all();
}

/** Most recently changed documents. */
export function recentDocs(db: Db, limit = 10) {
  return db
    .select({ path: brainDocs.path, title: brainDocs.title, mtime: brainDocs.mtime })
    .from(brainDocs)
    .orderBy(desc(brainDocs.mtime))
    .limit(limit)
    .all();
}
