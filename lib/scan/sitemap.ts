/** A sitemap's entries: page URLs (`urlset`) or child sitemap URLs (`index`). */
export type Sitemap = { kind: "urlset" | "index" | "invalid"; locs: string[] };

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

// Optional namespace prefix (`<sm:loc>`); the value is CDATA or plain text. `[^<]*` and
// `[^\]]*` keep each match linear on a 5 MiB file.
const LOC = /<(?:[\w-]+:)?loc>(?:\s*<!\[CDATA\[([^\]]*)\]\]>\s*|([^<]*))<\/(?:[\w-]+:)?loc>/gi;

/**
 * Reads up to `maxLocs` `<loc>` entries from sitemap XML. A plain scan rather than an XML
 * parser: sitemaps are flat.
 */
export function parseSitemap(xml: string, maxLocs = Number.POSITIVE_INFINITY): Sitemap {
  const kind = /<(?:[\w-]+:)?sitemapindex[\s>]/i.test(xml)
    ? "index"
    : /<(?:[\w-]+:)?urlset[\s>]/i.test(xml)
      ? "urlset"
      : "invalid";
  if (kind === "invalid") return { kind, locs: [] };
  const locs: string[] = [];
  for (const match of xml.matchAll(LOC)) {
    if (locs.length >= maxLocs) break;
    // CDATA is literal; only plain text carries entities.
    const loc = match[1] !== undefined ? match[1].trim() : decode((match[2] ?? "").trim());
    if (loc) locs.push(loc);
  }
  return { kind, locs };
}
