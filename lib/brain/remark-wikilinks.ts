import type { PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import { brainHref, type LinkIndex, resolveWikiLink, WIKI_LINK } from "./wikilinks";

type Options = { index: LinkIndex; onLink: (path: string) => void };

function toNodes(value: string, options: Options): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let last = 0;
  for (const match of value.matchAll(new RegExp(WIKI_LINK.source, "g"))) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: "text", value: value.slice(last, start) });
    const target = match[1]?.trim() ?? "";
    const label = match[2]?.trim() || target;
    const resolved = resolveWikiLink(options.index, target);
    if (resolved) {
      options.onLink(resolved.path);
      parts.push({
        type: "link",
        url: brainHref(resolved.path),
        title: resolved.alternatives.length
          ? `Also matches: ${resolved.alternatives.join(", ")}`
          : null,
        children: [{ type: "text", value: label }],
        data: { hProperties: { className: ["wikilink"] } },
      });
    } else {
      parts.push({
        type: "emphasis",
        children: [{ type: "text", value: label }],
        data: {
          hName: "span",
          hProperties: { className: ["wikilink-broken"], title: `No document named “${target}”` },
        },
      });
    }
    last = start + match[0].length;
  }
  if (parts.length > 0 && last < value.length)
    parts.push({ type: "text", value: value.slice(last) });
  return parts;
}

/** Replaces `[[wiki-links]]` in text with links (resolved) or visibly broken spans. */
export function remarkWikiLinks(options: Options) {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const parts = toNodes(node.value, options);
      if (parts.length === 0) return;
      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}
