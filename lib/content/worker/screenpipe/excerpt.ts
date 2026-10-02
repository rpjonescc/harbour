import { skeleton } from "./canonical";

// A text hit is a whole-screen dump, so only the words around a content term are kept (spec §18).
const CONTEXT = 120;
export const EXCERPT_CHARS = 300;
const MAX_PER_FRAME = 5;

type Span = { start: number; end: number };

/**
 * The stretches of already-redacted, canonical `text` within 120 characters of an occurrence of
 * any of `patterns` (term patterns): occurrences close together share one excerpt of at most 300
 * characters, and an occurrence that would make it longer starts the next one after it, so no
 * words are repeated. The caller redacts the whole frame first: cutting before redaction could
 * leave half a secret. At most five excerpts per frame, so a repeated term cannot flood the output.
 */
export function cutExcerpts(text: string, patterns: readonly RegExp[]): string[] {
  const key = skeleton(text);
  const found: Span[] = [];
  for (const pattern of patterns) {
    for (const match of key.matchAll(pattern)) {
      found.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  for (const term of found) {
    const last = out[out.length - 1];
    const end = Math.min(text.length, term.end + CONTEXT);
    if (last && end - last.start <= EXCERPT_CHARS) {
      last.end = Math.max(last.end, end);
    } else if (last && term.end <= last.end) {
      continue; // already inside the last excerpt, which cannot grow
    } else {
      const start = Math.max(0, term.start - CONTEXT, last?.end ?? 0);
      out.push({ start, end: Math.min(end, start + EXCERPT_CHARS) });
    }
    if (out.length > MAX_PER_FRAME) break;
  }
  return out.slice(0, MAX_PER_FRAME).map((span) => text.slice(span.start, span.end).trim());
}
