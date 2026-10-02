import type { Platform } from "@/lib/content/ids";
import type { ProductConfig } from "./config";

/**
 * What the content machine knows about one thing it writes for: a monitored website ("site") or a
 * project with no website ("project", spec §18). Call sites never look at the config shape.
 */
export type ContentProduct = {
  id: string;
  name: string;
  kind: "site" | "project";
  /** The site's address; null for a project, which has none. */
  url: string | null;
  terms: string[];
  platforms: Platform[];
  /** Hosts a piece may link to: the site's own host, or none for a project (every link is rejected). */
  allowedHosts: string[];
};

/** The host of an http(s) URL without a leading "www.", or none when the URL is odd. */
function siteHosts(url: string): string[] {
  if (!URL.canParse(url)) return [];
  return [new URL(url).hostname.toLowerCase().replace(/^www\./, "")];
}

/** The products with content enabled, then the content-only projects, in config order. */
export function contentProducts(config: ProductConfig): ContentProduct[] {
  const entries = config.content?.products ?? {};
  const sites = config.products.flatMap((product): ContentProduct[] => {
    const entry = entries[product.id];
    if (!entry) return [];
    return [
      {
        id: product.id,
        name: product.name,
        kind: "site",
        url: product.url,
        terms: entry.terms,
        platforms: entry.platforms,
        allowedHosts: siteHosts(product.url),
      },
    ];
  });
  const projects = Object.entries(config.content?.projects ?? {}).map(
    ([id, project]): ContentProduct => ({
      id,
      name: project.name,
      kind: "project",
      url: null,
      terms: project.terms,
      platforms: project.platforms,
      allowedHosts: [],
    }),
  );
  return [...sites, ...projects];
}
