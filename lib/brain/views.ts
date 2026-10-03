import { and, count, desc, eq, gt, isNull, max, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { brainDocs, brainLinks } from "@/lib/db/schema";

/** Records that the owner opened a document (clears its "new" badge). */
export function markViewed(db: Db, path: string, now: Date = new Date()): void {
  db.update(brainDocs).set({ lastViewedAt: now }).where(eq(brainDocs.path, path)).run();
}

const isNew = or(isNull(brainDocs.lastViewedAt), gt(brainDocs.mtime, brainDocs.lastViewedAt));

/** Documents never opened, or changed since they were last opened. */
export function newDocPaths(db: Db): Set<string> {
  const rows = db.select({ path: brainDocs.path }).from(brainDocs).where(isNew).all();
  return new Set(rows.map((row) => row.path));
}

/** Whether one indexed document is new (unindexed paths are not). */
export function isNewDoc(db: Db, path: string): boolean {
  const row = db
    .select({ path: brainDocs.path })
    .from(brainDocs)
    .where(and(eq(brainDocs.path, path), isNew))
    .get();
  return row !== undefined;
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

/** How many documents the index holds and when the newest one changed (null when there are none). */
export function brainStats(db: Db): { notes: number; newest: Date | null } {
  const row = db
    .select({ notes: count(), newest: max(brainDocs.mtime) })
    .from(brainDocs)
    .get();
  return { notes: row?.notes ?? 0, newest: row?.newest ?? null };
}
