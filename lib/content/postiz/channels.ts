import { z } from "zod";
import type { Platform } from "@/lib/content/ids";

/** The platforms a Postiz draft is made for. X is not used; a blog post and a website section are not social posts. */
export const POSTIZ_PLATFORMS = ["linkedin", "facebook", "instagram"] as const;
export type PostizPlatform = (typeof POSTIZ_PLATFORMS)[number];

export function isPostizPlatform(platform: Platform): platform is PostizPlatform {
  return (POSTIZ_PLATFORMS as readonly string[]).includes(platform);
}

/** The Postiz channel kinds (its `identifier`) that can take each platform's piece. */
export const CHANNEL_KINDS: Readonly<Record<PostizPlatform, readonly string[]>> = {
  linkedin: ["linkedin", "linkedin-page"],
  facebook: ["facebook"],
  instagram: ["instagram", "instagram-standalone"],
};

/** A Postiz channel id (Postiz makes cuid-like ids); nothing that could change a URL or a header. */
export const channelIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "a Postiz channel id");

/** `content.postiz` in harbour.config.json: which Postiz channel each platform's drafts go to. */
export const postizConfigSchema = z.strictObject({
  channels: z.strictObject({
    linkedin: channelIdSchema.optional(),
    facebook: channelIdSchema.optional(),
    instagram: channelIdSchema.optional(),
  }),
});
export type PostizChannels = z.infer<typeof postizConfigSchema>["channels"];
