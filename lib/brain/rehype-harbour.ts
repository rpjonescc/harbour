import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import { visit } from "unist-util-visit";

export type OutlineItem = { id: string; text: string; depth: 2 | 3 };

const EXTERNAL = /^https?:\/\//i;
/** Ids from rehype-slug; anything else (e.g. the footnotes label) stays out of the outline. */
const HEADING_ID = /^h-/;
/** Prefix rehype-sanitize adds to generated ids such as footnotes. */
const CLOBBER = "user-content-";
const NEW_TAB = { target: "_blank", rel: ["noopener", "noreferrer"] };

/** Same-page anchor `#x` → the id that actually exists: x, the sanitised footnote id, or `h-x`. */
function localTarget(fragment: string, ids: Set<string>): string {
  if (ids.has(fragment)) return fragment;
  if (ids.has(`${CLOBBER}${fragment}`)) return `${CLOBBER}${fragment}`;
  return `h-${fragment}`;
}

/** External links open safely, remote images become links, and h2/h3 feed the outline. */
export function rehypeHarbour(options: { outline: OutlineItem[] }) {
  return (tree: Root) => {
    const ids = new Set<string>();
    visit(tree, "element", (node: Element) => {
      if (typeof node.properties.id === "string") ids.add(node.properties.id);
    });
    visit(tree, "element", (node: Element, index, parent) => {
      const href = node.properties.href;
      if (node.tagName === "a" && typeof href === "string" && EXTERNAL.test(href)) {
        Object.assign(node.properties, NEW_TAB);
      }
      if (
        node.tagName === "a" &&
        typeof href === "string" &&
        href.startsWith("#") &&
        href.length > 1
      ) {
        node.properties.href = `#${localTarget(href.slice(1), ids)}`;
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
      const isHeading = node.tagName === "h2" || node.tagName === "h3";
      if (isHeading && typeof id === "string" && HEADING_ID.test(id)) {
        options.outline.push({ id, text: textOf(node), depth: node.tagName === "h2" ? 2 : 3 });
      }
    });
  };
}
