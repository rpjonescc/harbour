import { z } from "zod";
import type { Platform } from "./ids";
import { X_SEPARATOR } from "./render";

/** Words as a reader counts them: runs of non-space characters. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Whether X counts a character once (its light ranges); every other character counts twice. */
function isLight(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    code <= 0x10ff ||
    (code >= 0x2000 && code <= 0x200d) ||
    (code >= 0x2010 && code <= 0x201f) ||
    (code >= 0x2032 && code <= 0x2037)
  );
}

/** X's weighted length: every link counts 23, and characters outside X's light ranges (emoji, CJK) count 2. */
export function weightedLength(text: string): number {
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  const rest = Array.from(text.replace(/https?:\/\/\S+/g, ""));
  return rest.reduce((n, c) => n + (isLight(c) ? 1 : 2), links.length * 23);
}

/** The text with its hashtags after it, as a piece is copied (blank line between). */
export const withHashtags = (text: string, hashtags: readonly string[]): string =>
  hashtags.length > 0 ? `${text}\n\n${hashtags.join(" ")}` : text;

// A hashtag typed into the text: the shape keeps hashtags in their own list, where they are counted.
const INLINE_HASHTAG = /(?<![\w#&/])#\p{L}/u;
const noInlineHashtag = (value: string) => !INLINE_HASHTAG.test(value);
const INLINE_MESSAGE = { message: "has a hashtag in the text: put hashtags in the hashtags list" };

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

const x = z
  .strictObject({
    posts: z
      .array(
        text(1400)
          .refine((post) => weightedLength(post) <= 280, {
            message: "is too long for X: the limit is 280 characters (a link counts 23)",
          })
          .refine((post) => !post.includes(X_SEPARATOR), {
            message: "contains the line Harbour uses to split posts",
          })
          .refine(noInlineHashtag, INLINE_MESSAGE),
      )
      .min(1)
      .max(5, { message: "has too many posts: the limit is 5" }),
    hashtags: tags(0, 1),
  })
  .refine(
    ({ posts, hashtags }) => weightedLength(`${posts.at(-1)} ${hashtags.join(" ")}`.trim()) <= 280,
    { path: ["posts"], message: "is too long for X once the hashtag is added: the limit is 280" },
  );

const slide = z.strictObject({ headline: text(60), body: text(200) });

/** A plain-text platform: its text has no inline hashtag, and text plus hashtags fits `cap` as copied. */
function fitsWithHashtags<F extends "text" | "caption">(field: F, cap: number) {
  return (value: { hashtags: string[] } & Record<F, string>) =>
    withHashtags(value[field], value.hashtags).length <= cap;
}
const tooLongWithTags = (cap: number) => ({
  path: ["hashtags"],
  message: `are too long with the text: text and hashtags together are limited to ${cap} characters`,
});

/** The six platform shapes (spec §7.3). `.strictObject`: an unknown key is a validation failure. */
export const contentSchemas = {
  linkedin: z
    .strictObject({
      text: text(3000).refine(noInlineHashtag, INLINE_MESSAGE),
      hashtags: tags(0, 3),
    })
    .refine(fitsWithHashtags("text", 3000), tooLongWithTags(3000)),
  x,
  instagram: z
    .strictObject({
      caption: text(2200).refine(noInlineHashtag, INLINE_MESSAGE),
      hashtags: tags(3, 8),
      visual: z.strictObject({ concept: text(300), onImageText: text(60), altText: text(250) }),
      carousel: z.strictObject({ slides: z.array(slide).min(3).max(10) }).optional(),
    })
    .refine(fitsWithHashtags("caption", 2200), tooLongWithTags(2200)),
  facebook: z
    .strictObject({
      text: text(1500).refine(noInlineHashtag, INLINE_MESSAGE),
      hashtags: tags(0, 2),
    })
    .refine(fitsWithHashtags("text", 1500), tooLongWithTags(1500)),
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
