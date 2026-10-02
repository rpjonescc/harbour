import { z } from "zod";

export const PLATFORMS = ["linkedin", "x", "instagram", "facebook", "blog", "website"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const platformSchema = z.enum(PLATFORMS);

/** What the owner sees (plain-language spec): never the key. */
export const PLATFORM_NAMES: Record<Platform, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  blog: "Blog post",
  website: "Website section",
};

export const productIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);
/** `<productId>-<YYYYMMDD>-<slug>`: lowercase words joined by single hyphens, at most 80 characters. */
export const ideaIdSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
/** `<ideaId>.<platform>`: an idea id has no dot, so the last dot splits the two. */
export const pieceIdSchema = z
  .string()
  .max(90)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:linkedin|x|instagram|facebook|blog|website)$/);

/** A lowercase ASCII slug of `text`, cut at `max` characters; "idea" when nothing is left. */
export function slugify(text: string, max = 40): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "idea";
}

/** The id of a new idea; the worker makes it from the validated title, never from agent text. */
export function makeIdeaId(productId: string, day: string, title: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("makeIdeaId: day must be YYYY-MM-DD");
  const head = `${productIdSchema.parse(productId)}-${day.replaceAll("-", "")}-`;
  return ideaIdSchema.parse(`${head}${slugify(title, Math.max(1, 80 - head.length))}`);
}

export const pieceId = (ideaId: string, platform: Platform): string => `${ideaId}.${platform}`;

/** The idea and platform of a piece id, or null when `id` is not one. */
export function splitPieceId(id: string): { ideaId: string; platform: Platform } | null {
  if (!pieceIdSchema.safeParse(id).success) return null;
  const dot = id.lastIndexOf(".");
  // Safe: pieceIdSchema just matched the suffix against the six platform names.
  return { ideaId: id.slice(0, dot), platform: id.slice(dot + 1) as Platform };
}
