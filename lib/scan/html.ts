import { type HTMLElement, parse } from "node-html-parser";
import { summariseJsonLd } from "./json-ld";

/** What one HTML page says about itself, as the crawler records it. */
export type PageFacts = {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  descriptionLength: number;
  h1Count: number;
  /** Absolute URL. */
  canonical: string | null;
  robotsMeta: string | null;
  /** From the robots meta tag only; the crawler adds the X-Robots-Tag header. */
  noindex: boolean;
  lang: string | null;
  jsonLdTypes: string[];
  invalidJsonLd: number;
  hasFaqMarkup: boolean;
  wordCount: number;
  /** Unique same-origin http(s) link targets. */
  internalLinks: number;
  externalLinks: number;
  images: number;
  imagesMissingAlt: number;
  /** The internal link targets, absolute and without fragments, in page order. */
  links: string[];
};

const HIDDEN_TEXT = "script, style, noscript, template";

/** Directives that take a value after a colon (so the name before it is not a user agent). */
const VALUED_DIRECTIVES = new Set([
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "unavailable_after",
]);
/** Agents whose directives apply to this crawl's verdict: ours, and Google's (the SEO view). */
const OUR_AGENTS = new Set(["harbourbot", "googlebot"]);

/**
 * Whether a robots meta value or X-Robots-Tag header keeps the page out of the index. An
 * agent prefix ("otherbot: noindex, nofollow") scopes the directives after it, up to the next
 * prefix; only unscoped directives and those for HarbourBot or Googlebot count.
 */
export function hasNoindex(directives: string): boolean {
  let agent: string | null = null;
  for (const part of directives.toLowerCase().split(",")) {
    let directive = part.trim();
    const colon = directive.indexOf(":");
    const name = colon === -1 ? "" : directive.slice(0, colon).trim();
    if (colon !== -1 && !VALUED_DIRECTIVES.has(name)) {
      agent = name;
      directive = directive.slice(colon + 1).trim();
    }
    const applies = agent === null || OUR_AGENTS.has(agent);
    // Some sites separate directives with spaces rather than commas.
    const tokens = directive.split(/\s+/);
    if (applies && tokens.some((t) => t === "noindex" || t === "none")) return true;
  }
  return false;
}

function collapse(text: string): string | null {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 0 ? value : null;
}

function resolveHttp(raw: string, base: URL): URL | null {
  if (!URL.canParse(raw.trim(), base)) return null;
  const url = new URL(raw.trim(), base);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  return url;
}

function metaContent(root: HTMLElement, name: string): string | null {
  const meta = root
    .querySelectorAll("meta[name]")
    .find((el) => el.getAttribute("name")?.trim().toLowerCase() === name);
  return collapse(meta?.getAttribute("content") ?? "");
}

function documentTitle(root: HTMLElement): string | null {
  // An inline SVG's <title> is not the page title.
  const title = root.querySelectorAll("title").find((el) => !el.closest("svg"));
  return collapse(title?.text ?? "");
}

function canonicalOf(root: HTMLElement, base: URL): string | null {
  const link = root
    .querySelectorAll("link[rel]")
    .find((el) => (el.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  const href = link?.getAttribute("href");
  return href ? (resolveHttp(href, base)?.href ?? null) : null;
}

function linksOf(root: HTMLElement, base: URL, origin: string) {
  const internal = new Set<string>();
  const external = new Set<string>();
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    // A fragment-only link moves within this page; it isn't a link to another page.
    const url = href.trim().startsWith("#") ? null : resolveHttp(href, base);
    if (!url) continue;
    (url.origin === origin ? internal : external).add(url.href);
  }
  return { links: [...internal], external: external.size };
}

function baseUrl(root: HTMLElement, page: URL): URL {
  const href = root.querySelector("base[href]")?.getAttribute("href");
  return (href && resolveHttp(href, page)) || page;
}

function hasFaqMicrodata(root: HTMLElement): boolean {
  return root
    .querySelectorAll("[itemtype]")
    .some((el) => /\/FAQPage$/i.test((el.getAttribute("itemtype") ?? "").trim()));
}

/** Words of visible body text; removes hidden elements from `root`, so call it last. */
function visibleWordCount(root: HTMLElement): number {
  for (const el of root.querySelectorAll(HIDDEN_TEXT)) el.remove();
  const body = root.querySelector("body") ?? root;
  return body.structuredText.split(/\s+/).filter((word) => word.length > 0).length;
}

/** Extracts page facts from HTML served at `pageUrl` (the final URL after redirects). */
export function extractPage(html: string, pageUrl: string): PageFacts {
  const root = parse(html);
  const page = new URL(pageUrl);
  const base = baseUrl(root, page);
  const title = documentTitle(root);
  const metaDescription = metaContent(root, "description");
  const robotsMeta = metaContent(root, "robots");
  const blocks = root
    .querySelectorAll("script")
    .filter((el) => el.getAttribute("type")?.trim().toLowerCase() === "application/ld+json")
    .map((el) => el.rawText);
  const jsonLd = summariseJsonLd(blocks);
  const { links, external } = linksOf(root, base, page.origin);
  const images = root.querySelectorAll("img");
  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    descriptionLength: metaDescription?.length ?? 0,
    h1Count: root.querySelectorAll("h1").length,
    canonical: canonicalOf(root, base),
    robotsMeta,
    noindex: robotsMeta !== null && hasNoindex(robotsMeta),
    lang: collapse(root.querySelector("html")?.getAttribute("lang") ?? ""),
    jsonLdTypes: jsonLd.types,
    invalidJsonLd: jsonLd.invalid,
    hasFaqMarkup: jsonLd.types.includes("FAQPage") || hasFaqMicrodata(root),
    internalLinks: links.length,
    externalLinks: external,
    images: images.length,
    imagesMissingAlt: images.filter((img) => !img.hasAttribute("alt")).length,
    links,
    wordCount: visibleWordCount(root),
  };
}
