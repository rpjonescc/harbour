import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import { visit } from "unist-util-visit";

export type OutlineItem = { id: string; text: string; depth: 2 | 3 };

const EXTERNAL = /^https?:\/\//i;
const NEW_TAB = { target: "_blank", rel: ["noopener", "noreferrer"] };

/** External links open safely, remote images become links, and h2/h3 feed the outline. */
export function rehypeHarbour(options: { outline: OutlineItem[] }) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const href = node.properties.href;
      if (node.tagName === "a" && typeof href === "string" && EXTERNAL.test(href)) {
        Object.assign(node.properties, NEW_TAB);
      }
      if (node.tagName === "img" && parent && index !== undefined) {
        const src = typeof node.properties.src === "string" ? node.properties.src : "";
        const alt =
          typeof node.properties.alt === "string" && node.properties.alt
            ? node.properties.alt
            : src;
        parent.children[index] = {
          type: "element",
          tagName: "a",
          properties: { href: src, ...NEW_TAB },
          children: [{ type: "text", value: `Image: ${alt}` }],
        };
      }
      const id = node.properties.id;
      if ((node.tagName === "h2" || node.tagName === "h3") && typeof id === "string") {
        options.outline.push({ id, text: textOf(node), depth: node.tagName === "h2" ? 2 : 3 });
      }
    });
  };
}
