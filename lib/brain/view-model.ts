import "server-only";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { isoDateIn } from "@/lib/format/date";
import { type BrainDoc, readDoc } from "./docs";
import { editorUrlFor } from "./editor-url";
import { type OutlineItem, renderMarkdown, stripLeadingTitle } from "./render";
import { filePaths, listTree } from "./tree";
import { backlinks, isNewDoc, markViewed } from "./views";
import { buildLinkIndex } from "./wikilinks";

export type DocView = {
  doc: BrainDoc;
  html: string;
  outline: OutlineItem[];
  backlinks: { path: string; title: string }[];
  editorUrl: string | null;
  stale: boolean;
  /** New before this view recorded it, so the shell's counts are now out of date. */
  wasNew: boolean;
};

/** Everything a document page needs. Throws BrainPathError for bad paths (render 404). */
export async function loadDocView(root: string, path: string, now = new Date()): Promise<DocView> {
  const db = getDb();
  const config = getConfig();
  const doc = readDoc(root, path);
  const rendered = doc.tooLarge
    ? { html: "", outline: [] }
    : await renderMarkdown(
        stripLeadingTitle(doc.body, doc.title),
        buildLinkIndex(filePaths(listTree(root).nodes)),
      );
  const wasNew = isNewDoc(db, path);
  markViewed(db, path, now);
  const reviewBy = doc.frontmatter.review_by;
  return {
    doc,
    html: rendered.html,
    outline: rendered.outline,
    backlinks: backlinks(db, path),
    editorUrl: editorUrlFor(config.HARBOUR_EDITOR_URL_TEMPLATE, doc.absolutePath),
    stale: reviewBy !== undefined && reviewBy < isoDateIn(config.HARBOUR_TIMEZONE, now),
    wasNew,
  };
}
