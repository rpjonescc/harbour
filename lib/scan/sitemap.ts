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

/**
 * Reads `<loc>` entries from sitemap XML. A plain scan rather than an XML parser: sitemaps
 * are flat, and `[^<]*` keeps the match linear on a 5 MiB file.
 */
export function parseSitemap(xml: string): Sitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml)
    ? "index"
    : /<urlset[\s>]/i.test(xml)
      ? "urlset"
      : "invalid";
  if (kind === "invalid") return { kind, locs: [] };
  const locs: string[] = [];
  for (const match of xml.matchAll(/<loc>([^<]*)<\/loc>/gi)) {
    const loc = decode((match[1] ?? "").trim());
    if (loc) locs.push(loc);
  }
  return { kind, locs };
}
