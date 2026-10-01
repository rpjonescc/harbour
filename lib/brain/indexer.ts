import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { brainDocs, brainLinks } from "@/lib/db/schema";
import { titleFor } from "./docs";
import { splitFrontmatter } from "./frontmatter";
import { filePaths, listTree } from "./tree";
import { buildLinkIndex, extractWikiTargets, type LinkIndex, resolveWikiLink } from "./wikilinks";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function replaceLinks(tx: Tx, path: string, body: string, linkIndex: LinkIndex) {
  tx.delete(brainLinks).where(eq(brainLinks.fromPath, path)).run();
  const targets = new Set(
    extractWikiTargets(body)
      .map((target) => resolveWikiLink(linkIndex, target)?.path)
      .filter((target): target is string => target !== undefined && target !== path),
  );
  for (const toPath of targets) {
    tx.insert(brainLinks).values({ fromPath: path, toPath }).onConflictDoNothing().run();
  }
}

/**
 * Brings brain_docs, brain_fts and brain_links in line with the files on disk.
 * Unchanged files (same content hash) are skipped, except that links are re-resolved
 * for every document when files were added or removed.
 */
export function reindexAll(db: Db, root: string): { indexed: number; removed: number } {
  const paths = filePaths(listTree(root).nodes);
  const present = new Set(paths);
  const linkIndex = buildLinkIndex(paths);
  const existing = new Map(
    db
      .select({ path: brainDocs.path, hash: brainDocs.contentHash, mtime: brainDocs.mtime })
      .from(brainDocs)
      .all()
      .map((row) => [row.path, { hash: row.hash, mtime: row.mtime }]),
  );
  const pathsChanged = paths.length !== existing.size || paths.some((p) => !existing.has(p));
  const gone = [...existing.keys()].filter((path) => !present.has(path));
  let indexed = 0;

  db.transaction((tx) => {
    for (const path of paths) {
      const absolute = join(root, path);
      const text = readFileSync(absolute, "utf8");
      const hash = createHash("sha256").update(text).digest("hex");
      const { frontmatter, body } = splitFrontmatter(text);
      const mtime = statSync(absolute).mtime;
      const prior = existing.get(path);
      if (prior?.hash === hash) {
        if (prior.mtime.getTime() !== mtime.getTime()) {
          tx.update(brainDocs).set({ mtime }).where(eq(brainDocs.path, path)).run();
        }
        if (pathsChanged) replaceLinks(tx, path, body, linkIndex);
        continue;
      }
      const title = titleFor(path, frontmatter, body);
      tx.insert(brainDocs)
        .values({ path, title, mtime, contentHash: hash, lastViewedAt: null })
        .onConflictDoUpdate({ target: brainDocs.path, set: { title, mtime, contentHash: hash } })
        .run();
      tx.run(sql`DELETE FROM brain_fts WHERE path = ${path}`);
      tx.run(sql`INSERT INTO brain_fts (path, title, body) VALUES (${path}, ${title}, ${body})`);
      replaceLinks(tx, path, body, linkIndex);
      indexed += 1;
    }
    for (const path of gone) {
      tx.delete(brainDocs).where(eq(brainDocs.path, path)).run();
      tx.run(sql`DELETE FROM brain_fts WHERE path = ${path}`);
      tx.delete(brainLinks)
        .where(or(eq(brainLinks.fromPath, path), eq(brainLinks.toPath, path)))
        .run();
    }
  });

  return { indexed, removed: gone.length };
}
