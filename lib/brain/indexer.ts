import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { brainDocs, brainLinks } from "@/lib/db/schema";
import { MAX_DOC_BYTES, titleFor } from "./docs";
import { splitFrontmatter } from "./frontmatter";
import { filePaths, listTree, TREE_LIMIT } from "./tree";
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
 * for every document when files were added or removed. Files over MAX_DOC_BYTES are left
 * out of the index and reported in `skipped`.
 */
export function reindexAll(
  db: Db,
  root: string,
  limit = TREE_LIMIT,
): { indexed: number; removed: number; skipped: string[] } {
  const tree = listTree(root, limit);
  if (tree.truncated) throw new Error("Brain tree truncated; index unchanged");
  const allPaths = filePaths(tree.nodes);
  const sizes = new Map(allPaths.map((path) => [path, statSync(join(root, path))]));
  const skipped = allPaths.filter((path) => (sizes.get(path)?.size ?? 0) > MAX_DOC_BYTES);
  const paths = allPaths.filter((path) => !skipped.includes(path));
  const present = new Set(paths);
  // Oversized documents stay link targets: the viewer explains why they are not shown.
  const linkIndex = buildLinkIndex(allPaths);
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
      const mtime = sizes.get(path)?.mtime ?? statSync(absolute).mtime;
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
      const linksFrom = eq(brainLinks.fromPath, path);
      // An oversized file is still on disk, so links pointing at it stay.
      const onDisk = skipped.includes(path);
      tx.delete(brainLinks)
        .where(onDisk ? linksFrom : or(linksFrom, eq(brainLinks.toPath, path)))
        .run();
    }
  });

  return { indexed, removed: gone.length, skipped };
}
