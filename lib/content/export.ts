import { renderFile } from "./files";
import { type Platform, slugify } from "./ids";
import { renderPiece } from "./render";
import type { ContentOf, PieceContent } from "./shapes";

const join = (...parts: string[]) => parts.filter((p) => p !== "").join("\n\n");

/** Instagram's caption first, then the brief and outline under plain headings (spec §10.4). */
function instagramExport(c: ContentOf<"instagram">): string {
  const slides = c.carousel?.slides ?? [];
  return join(
    c.caption,
    c.hashtags.join(" "),
    `## Visual brief\n\nConcept: ${c.visual.concept}\n\nText on the image: ${c.visual.onImageText}\n\nAlt text: ${c.visual.altText}`,
    slides.length > 0
      ? `## Carousel outline\n\n${slides.map((s, i) => `${i + 1}. ${s.headline}: ${s.body}`).join("\n")}`
      : "",
  );
}

/** The piece, clean: no gate data, no Harbour notes (spec §10.4). Blog reads answer first. */
export function exportBody(platform: Platform, content: PieceContent): string {
  return platform === "instagram"
    ? instagramExport(content as ContentOf<"instagram">)
    : renderPiece(platform, content);
}

/** The export's file slug: the blog's own, else the piece title's; always cut to a safe length. */
export function exportSlug(platform: Platform, title: string, content: PieceContent): string {
  return slugify(platform === "blog" ? (content as ContentOf<"blog">).slug : title, 60);
}

/** The whole export file: the spec's frontmatter, then the clean piece. */
export function renderExport(input: {
  title: string;
  product: string;
  platform: Platform;
  approved: string;
  idea: string;
  content: PieceContent;
}): string {
  const blog = input.platform === "blog" ? (input.content as ContentOf<"blog">) : null;
  const extra = blog
    ? { metaTitle: blog.metaTitle, metaDescription: blog.metaDescription, slug: blog.slug }
    : {};
  const front = {
    title: input.title,
    product: input.product,
    platform: input.platform,
    approved: input.approved,
    idea: input.idea,
    ...extra,
  };
  return renderFile(front, exportBody(input.platform, input.content));
}
