import { type HTMLElement, parse } from "node-html-parser";
import { summariseJsonLd } from "./json-ld";
import { type QuestionFacts, questionFacts } from "./questions";

/** What one HTML page says about itself, as the crawler records it. */
export type PageFacts = QuestionFacts & {
  /** The document <title>, whitespace collapsed; null when missing or empty. */
  title: string | null;
  /** Characters in the title; 0 when there is none. */
  titleLength: number;
  /** <meta name="description"> content, whitespace collapsed; null when missing or empty. */
  metaDescription: string | null;
  descriptionLength: number;
  h1Count: number;
  /** <link rel="canonical"> as an absolute URL. */
  canonical: string | null;
  /** <meta name="robots"> content as written. */
  robotsMeta: string | null;
  /** From the robots meta tag only; the crawler adds the X-Robots-Tag header. */
  noindex: boolean;
  /** <html lang>. */
  lang: string | null;
  /** schema.org types in JSON-LD (top level and @graph), sorted and unique. */
  jsonLdTypes: string[];
  /** JSON-LD blocks that are not valid JSON. */
  invalidJsonLd: number;
  /** FAQPage in JSON-LD or microdata. */
  hasFaqMarkup: boolean;
  /** Newest datePublished of an Article-type JSON-LD node, as ISO 8601; null when none. */
  articleDatePublished: string | null;
  /** A link to Google's Preferred Sources page (google.com/preferences/source). */
  preferredSourcesLink: boolean;
  /** Words of visible body text (scripts, styles, noscript and templates excluded). */
  wordCount: number;
  /** Unique same-origin http(s) link targets (fragment-only links excluded). */
  internalLinks: number;
  /** Unique http(s) link targets on other origins. */
  externalLinks: number;
  images: number;
  /** <img> without an alt attribute; alt="" marks a decorative image and counts as present. */
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
 * prefix; only unscoped directives and those for HarbourBot or Googlebot count. Pass each
 * X-Robots-Tag header on its own: an agent prefix scopes only the header it is in.
 */
export function hasNoindex(directives: string): boolean {
  let agent: string | null = null;
  for (const part of directives.toLowerCase().split(",")) {
    let directive = part.trim();
    const colon = directive.indexOf(":");
    const name = colon === -1 ? "" : directive.slice(0, colon).trim();
    // An agent name is one token: "25-jun-10 15" (from a date's time) is not one.
    if (colon !== -1 && !/\s/.test(name) && !VALUED_DIRECTIVES.has(name)) {
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

const GOOGLE_HOSTS = new Set(["google.com", "www.google.com"]);

/** Google's "add as a preferred source" deeplink (https://www.google.com/preferences/source?q=…). */
function isPreferredSourcesLink(url: URL): boolean {
  return GOOGLE_HOSTS.has(url.hostname) && /^\/preferences\/source\/?$/.test(url.pathname);
}

function linksOf(root: HTMLElement, base: URL, origin: string) {
  const internal = new Set<string>();
  const external = new Set<string>();
  let preferredSources = false;
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    // A fragment-only link moves within this page; it isn't a link to another page.
    const url = href.trim().startsWith("#") ? null : resolveHttp(href, base);
    if (!url) continue;
    (url.origin === origin ? internal : external).add(url.href);
    preferredSources ||= isPreferredSourcesLink(url);
  }
  return { links: [...internal], external: external.size, preferredSources };
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
  const { links, external, preferredSources } = linksOf(root, base, page.origin);
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
    articleDatePublished: jsonLd.articleDatePublished,
    preferredSourcesLink: preferredSources,
    internalLinks: links.length,
    externalLinks: external,
    images: images.length,
    imagesMissingAlt: images.filter((img) => !img.hasAttribute("alt")).length,
    links,
    ...questionFacts(root),
    wordCount: visibleWordCount(root),
  };
}
