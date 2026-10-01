import rehypeSanitize, { defaultSchema, type Options as SanitizerSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { type OutlineItem, rehypeHarbour } from "./rehype-harbour";
import { remarkWikiLinks } from "./remark-wikilinks";
import type { LinkIndex } from "./wikilinks";

export type { OutlineItem };
export type RenderedDoc = { html: string; outline: OutlineItem[]; links: string[] };

// GitHub-style allowlist plus the two wiki-link classes and link titles.
const sanitizeSchema: SanitizerSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Sanitizer uses the first rule for an attribute; keep its footnote class and allow ours.
    a: [
      ["className", "wikilink", "data-footnote-backref"],
      ...(defaultSchema.attributes?.a ?? []),
      "title",
    ],
    span: [...(defaultSchema.attributes?.span ?? []), ["className", "wikilink-broken"], "title"],
  },
};

/** Markdown → sanitised HTML, with outline and the brain documents it links to. */
export async function renderMarkdown(body: string, index: LinkIndex): Promise<RenderedDoc> {
  const outline: OutlineItem[] = [];
  const links = new Set<string>();
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkWikiLinks, { index, onLink: (path: string) => links.add(path) })
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    // Prefixed so a heading such as "main" cannot reuse an id the app shell owns.
    .use(rehypeSlug, { prefix: "h-" })
    .use(rehypeHarbour, { outline })
    .use(rehypeStringify)
    .process(body);
  return { html: String(file), outline, links: [...links] };
}

/** Drops a leading `# Title` that repeats the page title (the page already shows it). */
export function stripLeadingTitle(body: string, title: string): string {
  const match = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(body);
  if (!match || match[1] !== title) return body;
  return body.slice(match[0].length).replace(/^\s+/, "");
}
