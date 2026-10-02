import { z } from "zod";
import type { Platform } from "./ids";

/** Words as a reader counts them: runs of non-space characters. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** X's weighted length: code points, with every link counted as 23. */
export function weightedLength(text: string): number {
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  return Array.from(text.replace(/https?:\/\/\S+/g, "")).length + links.length * 23;
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max, { message: `is too long: the limit is ${max} characters` });
const hashtag = z.string().regex(/^#[A-Za-z0-9_]{2,30}$/, { message: "is not a valid hashtag" });
const tags = (min: number, max: number) =>
  z
    .array(hashtag)
    .min(min)
    .max(max, { message: `has too many hashtags: the limit is ${max}` });
const words = (min: number, max: number, cap: number) =>
  z
    .string()
    .trim()
    .max(cap)
    .refine((value) => wordCount(value) >= min && wordCount(value) <= max, {
      message: `must be ${min} to ${max} words`,
    });

const x = z.strictObject({
  posts: z
    .array(
      text(1400).refine((post) => weightedLength(post) <= 280, {
        message: "is too long for X: the limit is 280 characters (a link counts 23)",
      }),
    )
    .min(1)
    .max(5, { message: "has too many posts: the limit is 5" }),
  hashtags: tags(0, 1),
});

const slide = z.strictObject({ headline: text(60), body: text(200) });

/** The six platform shapes (spec §7.3). `.strictObject`: an unknown key is a validation failure. */
export const contentSchemas = {
  linkedin: z.strictObject({ text: text(3000), hashtags: tags(0, 3) }),
  x,
  instagram: z.strictObject({
    caption: text(2200),
    hashtags: tags(3, 8),
    visual: z.strictObject({ concept: text(300), onImageText: text(60), altText: text(250) }),
    carousel: z.strictObject({ slides: z.array(slide).min(3).max(10) }).optional(),
  }),
  facebook: z.strictObject({ text: text(1500), hashtags: tags(0, 2) }),
  blog: z.strictObject({
    title: text(70),
    metaTitle: text(60),
    metaDescription: text(155),
    slug: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    answer: words(40, 60, 600),
    body: words(600, 1600, 20_000),
    faq: z
      .array(z.strictObject({ q: text(160), a: text(600) }))
      .max(5)
      .optional(),
  }),
  website: z.strictObject({
    heading: text(70),
    body: words(40, 120, 1200),
    bullets: z.array(text(100)).max(3),
    ctaLabel: text(60).refine((label) => wordCount(label) <= 4, {
      message: "must be 4 words or fewer",
    }),
  }),
} as const satisfies Record<Platform, z.ZodType>;

export type PieceContent = { [P in Platform]: z.infer<(typeof contentSchemas)[P]> }[Platform];
export type ContentOf<P extends Platform> = z.infer<(typeof contentSchemas)[P]>;
