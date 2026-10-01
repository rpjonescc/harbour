/** A sitemap entry: a page URL (urlset) or a child sitemap URL (index), with its `<lastmod>`. */
export type SitemapEntry = { loc: string; lastmod: string | null };

/** A sitemap's entries: pages (`urlset`) or child sitemaps (`index`). */
export type Sitemap = { kind: "urlset" | "index" | "invalid"; entries: SitemapEntry[] };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

// One pass over the tags that matter, each with an optional namespace prefix: an entry opening
// (`<url>`, `<sitemap>`), its `<loc>` or `<lastmod>` (CDATA or plain text), or its closing.
// `[^<]*` and `[^\]]*` keep each match linear on a 5 MiB file.
const TOKEN =
  /<(?:[\w-]+:)?(loc|lastmod)>(?:\s*<!\[CDATA\[([^\]]*)\]\]>\s*|([^<]*))<\/(?:[\w-]+:)?(?:loc|lastmod)>|<(\/?)(?:[\w-]+:)?(?:url|sitemap)[\s>]/gi;

/**
 * Reads up to `maxLocs` entries from sitemap XML. A plain scan rather than an XML parser:
 * sitemaps are flat. A `<lastmod>` counts only inside its own `<url>` or `<sitemap>` element.
 */
export function parseSitemap(xml: string, maxLocs = Number.POSITIVE_INFINITY): Sitemap {
  const kind = /<(?:[\w-]+:)?sitemapindex[\s>]/i.test(xml)
    ? "index"
    : /<(?:[\w-]+:)?urlset[\s>]/i.test(xml)
      ? "urlset"
      : "invalid";
  if (kind === "invalid") return { kind, entries: [] };
  const entries: SitemapEntry[] = [];
  let inEntry = false;
  let current: SitemapEntry | null = null;
  let lastmod: string | null = null;
  for (const match of xml.matchAll(TOKEN)) {
    const [, tag, cdata, plain, closing] = match;
    if (tag === undefined) {
      inEntry = closing !== "/";
      current = null;
      lastmod = null;
      continue;
    }
    // CDATA is literal; only plain text carries entities.
    const value = cdata !== undefined ? cdata.trim() : decode((plain ?? "").trim());
    if (!value) continue;
    if (tag.toLowerCase() === "loc") {
      if (entries.length >= maxLocs) break;
      current = { loc: value, lastmod: inEntry ? lastmod : null };
      entries.push(current);
    } else if (inEntry) {
      if (current) current.lastmod ??= value;
      else lastmod ??= value;
    }
  }
  return { kind, entries };
}
