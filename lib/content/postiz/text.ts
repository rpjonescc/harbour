import { contentSchemas, type PieceContent, withHashtags } from "@/lib/content/shapes";
import type { PostizPlatform } from "./channels";

/**
 * The words a Postiz draft carries: exactly the approved piece's post text and nothing else. For
 * LinkedIn and Facebook that is the text and its hashtags, as the Copy button gives it; for
 * Instagram the caption and its hashtags (the visual brief is for the owner, not the post).
 * The content is checked against the platform's shape again, so a mismatch is an error, not a guess.
 */
export function postText(platform: PostizPlatform, content: PieceContent): string {
  if (platform === "instagram") {
    const c = contentSchemas.instagram.parse(content);
    return withHashtags(c.caption, c.hashtags);
  }
  const c = contentSchemas[platform].parse(content);
  return withHashtags(c.text, c.hashtags);
}
