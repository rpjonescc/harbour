import { z } from "zod";
import type { Config } from "@/lib/config";
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

type PostizSettings = Pick<Config, "HARBOUR_POSTIZ_URL" | "HARBOUR_POSTIZ_API_KEY">;

/** Whether Postiz is set up at all: its address and key. The feature is off without them. */
export const postizConfigured = (config: PostizSettings): boolean =>
  Boolean(config.HARBOUR_POSTIZ_URL && config.HARBOUR_POSTIZ_API_KEY);

/** The platforms a draft can be sent for now: those with a channel, and none while Postiz is off. */
export function sendablePlatforms(
  config: PostizSettings,
  channels: PostizChannels,
): PostizPlatform[] {
  return postizConfigured(config) ? POSTIZ_PLATFORMS.filter((p) => channels[p] !== undefined) : [];
}
