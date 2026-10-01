import type { Text } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/** `[[target]]` or `[[target|label]]`. Create a new RegExp from `.source` before stateful use. */
export const WIKI_LINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

/** Lower-cased file name (no `.md`) → matching paths, shortest first. */
export type LinkIndex = Map<string, string[]>;

const keyFor = (name: string) => name.trim().toLowerCase().replace(/\.md$/, "");

export function buildLinkIndex(paths: string[]): LinkIndex {
  const index: LinkIndex = new Map();
  for (const path of paths) {
    const key = keyFor(path.split("/").pop() ?? path);
    index.set(key, [...(index.get(key) ?? []), path]);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.length - b.length || a.localeCompare(b));
  }
  return index;
}

/** Resolves a link name to a document; ambiguous names choose the shortest path. */
export function resolveWikiLink(
  index: LinkIndex,
  name: string,
): { path: string; alternatives: string[] } | null {
  const wanted = keyFor(name);
  if (wanted.includes("/")) {
    const match = [...index.values()]
      .flat()
      .find((p) => p.toLowerCase() === `${wanted}.md` || p.toLowerCase().endsWith(`/${wanted}.md`));
    return match ? { path: match, alternatives: [] } : null;
  }
  const [path, ...alternatives] = index.get(wanted) ?? [];
  return path ? { path, alternatives } : null;
}

const wikiParser = unified().use(remarkParse).use(remarkGfm);

/** Raw link targets in Markdown text nodes, excluding code examples. */
export function extractWikiTargets(body: string): string[] {
  const targets: string[] = [];
  visit(wikiParser.parse(body), "text", (node: Text) => {
    for (const match of node.value.matchAll(new RegExp(WIKI_LINK.source, "g"))) {
      const target = match[1]?.trim();
      if (target) targets.push(target);
    }
  });
  return targets;
}

/** URL of a document in the viewer. */
export function brainHref(path: string): string {
  return `/brain/${path.split("/").map(encodeURIComponent).join("/")}`;
}
