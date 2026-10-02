import { skeleton } from "./canonical";

// A text hit is a whole-screen dump, so only the words around a content term are kept (spec §18).
const CONTEXT = 120;
export const EXCERPT_CHARS = 300;
const MAX_PER_FRAME = 5;

type Span = { start: number; end: number };

/**
 * The stretches of already-redacted, canonical `text` within 120 characters of an occurrence of
 * any of `patterns` (term patterns), merged when they touch and never longer than 300 characters.
 * The caller redacts the whole frame first: cutting before redaction could leave half a secret.
 * At most five excerpts per frame, so a frame that repeats a term cannot flood the output.
 */
export function cutExcerpts(text: string, patterns: readonly RegExp[]): string[] {
  const found: Span[] = [];
  const key = skeleton(text);
  for (const pattern of patterns) {
    for (const match of key.matchAll(pattern)) {
      const end = match.index + match[0].length;
      found.push({
        start: Math.max(0, match.index - CONTEXT),
        end: Math.min(text.length, end + CONTEXT),
      });
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [];
  for (const span of found) {
    const last = merged[merged.length - 1];
    if (
      last &&
      span.start <= last.end &&
      Math.max(last.end, span.end) - last.start <= EXCERPT_CHARS
    ) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged
    .slice(0, MAX_PER_FRAME)
    .map((span) => text.slice(span.start, Math.min(span.end, span.start + EXCERPT_CHARS)).trim());
}
