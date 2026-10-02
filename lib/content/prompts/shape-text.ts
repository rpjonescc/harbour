import type { Platform } from "@/lib/content/ids";

/** The JSON shape of each platform's `content`, as the prompt shows it to the agent. */
export const SHAPE_TEXT: Record<Platform, string> = {
  linkedin: '{"text":"...","hashtags":["#tag"]}',
  x: '{"posts":["first post","next post"],"hashtags":[]}',
  instagram:
    '{"caption":"...","hashtags":["#tag","#tag","#tag"],"visual":{"concept":"...","onImageText":"...","altText":"..."},"carousel":{"slides":[{"headline":"...","body":"..."}]}}',
  facebook: '{"text":"...","hashtags":[]}',
  blog: '{"title":"...","metaTitle":"...","metaDescription":"...","slug":"lowercase-words-with-hyphens","answer":"40 to 60 words","body":"markdown","faq":[{"q":"...","a":"..."}]}',
  website: '{"heading":"...","body":"...","bullets":["..."],"ctaLabel":"Try it free"}',
};
