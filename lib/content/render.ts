import type { Platform } from "./ids";
import type { PieceContent } from "./shapes";

export const X_SEPARATOR = "-- next post --";
/** The one text field the owner edits for each platform (spec §10.3: "the body only"). */
export const PRIMARY_FIELD = {
  linkedin: "text",
  x: "posts",
  instagram: "caption",
  facebook: "text",
  blog: "body",
  website: "body",
} as const satisfies Record<Platform, string>;

// The content was validated against its platform's shape before it got here; these reads rely on it.
type Loose = Record<string, unknown> & { hashtags?: string[] };
const tags = (c: Loose) => (c.hashtags?.length ? c.hashtags.join(" ") : "");
const join = (...parts: string[]) => parts.filter((p) => p !== "").join("\n\n");

function xPosts(c: Loose): string[] {
  const posts = [...(c.posts as string[])];
  const last = posts.length - 1;
  if (tags(c)) posts[last] = `${posts[last]} ${tags(c)}`;
  return posts;
}

function instagram(c: Loose): string {
  const v = c.visual as { concept: string; onImageText: string; altText: string };
  const slides =
    (c.carousel as { slides: { headline: string; body: string }[] } | undefined)?.slides ?? [];
  const outline = slides.map((s, i) => `Slide ${i + 1}: ${s.headline}. ${s.body}`).join("\n");
  return join(
    c.caption as string,
    tags(c),
    `Visual brief\nConcept: ${v.concept}\nText on the image: ${v.onImageText}\nAlt text: ${v.altText}`,
    slides.length ? `Carousel outline\n${outline}` : "",
  );
}

function blog(c: Loose): string {
  const faq = (c.faq as { q: string; a: string }[] | undefined) ?? [];
  return join(c.answer as string, c.body as string, ...faq.map((f) => `### ${f.q}\n\n${f.a}`));
}

function website(c: Loose): string {
  const bullets = ((c.bullets as string[]) ?? []).map((b) => `- ${b}`).join("\n");
  return join(c.heading as string, c.body as string, bullets, c.ctaLabel as string);
}

/** The piece as a reader sees it: the stored body and the page's reading view. */
export function renderPiece(platform: Platform, content: PieceContent): string {
  const c = content as Loose;
  if (platform === "linkedin" || platform === "facebook") return join(c.text as string, tags(c));
  if (platform === "x") {
    return xPosts(c)
      .map((p, i, all) => `${i + 1}/${all.length} ${p}`)
      .join("\n\n");
  }
  if (platform === "instagram") return instagram(c);
  if (platform === "blog") return blog(c);
  if (platform === "website") return website(c);
  throw new Error("Unknown platform");
}

/** What each Copy button copies: clean text, none of Harbour's metadata. */
export function copyParts(
  platform: Platform,
  content: PieceContent,
): { label: string; text: string }[] {
  const c = content as Loose;
  if (platform === "x") return xPosts(c).map((text, i) => ({ label: `Post ${i + 1}`, text }));
  if (platform === "instagram") {
    return [
      { label: "Caption", text: c.caption as string },
      { label: "Hashtags", text: tags(c) },
    ];
  }
  return [{ label: "Whole piece", text: renderPiece(platform, content) }];
}

/** The text the owner edits. X posts are joined by a line of `-- next post --`. */
export function primaryText(platform: Platform, content: PieceContent): string {
  const value = (content as Loose)[PRIMARY_FIELD[platform]];
  return Array.isArray(value) ? value.join(`\n\n${X_SEPARATOR}\n\n`) : String(value);
}

/** The content with its primary text replaced by the owner's; the rest is kept as stored. */
export function withPrimaryText(
  platform: Platform,
  content: PieceContent,
  text: string,
): PieceContent {
  const value =
    platform === "x"
      ? text
          .split(X_SEPARATOR)
          .map((p) => p.trim())
          .filter(Boolean)
      : text.trim();
  return { ...content, [PRIMARY_FIELD[platform]]: value } as PieceContent;
}
