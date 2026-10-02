import { canonicalise, matchKey, termPattern } from "./canonical";
import { isDeniedByNames } from "./deny-lists";
import { cutExcerpts, EXCERPT_CHARS } from "./excerpt";
import { hasPrivateCue } from "./frame-checks";
import { type Compiled, compileRules, containsAny, type RedactRules, redactFull } from "./redact";
import { type Hit, MAX_HIT_CHARS } from "./schema";

// Bounds for one product's text hits: what Harbour reads, in work and in output (spec §18).
const MAX_HITS = 300;
const MAX_TOTAL_CHARS = 200_000;
export const MAX_EXCERPTS = 30;
const MAX_BYTES = 24 * 1024;

/** Milliseconds since the epoch, or Infinity when the time is missing or unreadable (sorted last). */
function timeOf(hit: Hit): number {
  const stamp = hit?.timestamp;
  const at = typeof stamp === "string" ? Date.parse(stamp) : Number.NaN;
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

/**
 * The excerpts of one hit that may go on: nothing when the frame holds a private-context cue or
 * its app or window (if it has them) is on a deny-list. The whole frame is redacted first and the
 * excerpts are cut from the redacted text, so a cut can never leave half a secret; each excerpt is
 * redacted again and must still be on topic, so a term inside a link cannot vouch for what is near it.
 */
function excerptsOf(hit: Hit, compiled: Compiled, patterns: readonly RegExp[]): string[] {
  if (typeof hit.text !== "string" || hit.text.length > MAX_HIT_CHARS) return [];
  const canonical = canonicalise(hit.text);
  if (!containsAny(matchKey(canonical), compiled.terms)) return [];
  if (hasPrivateCue(canonical)) return [];
  if (isDeniedByNames(hit.app, hit.window, compiled.excluded)) return [];
  const out: string[] = [];
  for (const piece of cutExcerpts(redactFull(canonical, compiled), patterns)) {
    const text = Array.from(redactFull(canonicalise(piece), compiled))
      .slice(0, EXCERPT_CHARS)
      .join("");
    if (containsAny(matchKey(text), compiled.terms)) out.push(text);
  }
  return out;
}

/** Near-duplicate key: the letters only, so a clock or a counter changing does not make a new excerpt. */
const lettersOnly = (text: string): string => matchKey(text).replace(/[^\p{L}]/gu, "");

/** `count` items spread evenly over `items` (already in time order). */
function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from(
    { length: count },
    (_, i) => items[Math.floor((i * items.length) / count)] as T,
  );
}

/**
 * Text hits to what a model may see (spec §18): earliest first, each distinct frame once; frame
 * checks; excerpts around the content terms, redacted; near-duplicates dropped; at most 30 spread
 * evenly over the day and 24 KiB. Anything that makes a rule throw is private and skipped. Work is
 * bounded: 300 hits and 200,000 characters per call, the rest skipped and `truncated` set.
 */
export function filterHits(
  hits: readonly Hit[],
  rules: RedactRules,
): { kept: string[]; truncated: boolean } {
  const compiled = compileRules(rules);
  const patterns = rules.terms.flatMap((t) => {
    const pattern = typeof t === "string" ? termPattern(t) : null;
    return pattern === null ? [] : [pattern];
  });
  const ordered = hits.map((hit, i) => ({ hit, i, at: timeOf(hit) }));
  ordered.sort((a, b) => a.at - b.at || a.i - b.i);
  const seenFrames = new Set<string>();
  const seenExcerpts = new Set<string>();
  const found: string[] = [];
  let truncated = false;
  let chars = 0;
  let frames = 0;
  for (const { hit } of ordered) {
    if (typeof hit?.text !== "string" || seenFrames.has(hit.text)) continue;
    seenFrames.add(hit.text);
    frames += 1;
    if (frames > MAX_HITS || chars + hit.text.length > MAX_TOTAL_CHARS) {
      truncated = true;
      continue;
    }
    chars += hit.text.length;
    try {
      for (const text of excerptsOf(hit, compiled, patterns)) {
        const key = lettersOnly(text);
        if (key === "" || seenExcerpts.has(key)) continue;
        seenExcerpts.add(key);
        found.push(text);
      }
    } catch {
      // Fail closed: a frame that breaks a rule is private. Nothing about it is kept or logged.
    }
  }
  const picked = spread(found, MAX_EXCERPTS);
  truncated ||= picked.length < found.length;
  const kept: string[] = [];
  let bytes = 0;
  for (const text of picked) {
    const size = Buffer.byteLength(text, "utf8") + 1;
    if (bytes + size > MAX_BYTES) return { kept, truncated: true };
    bytes += size;
    kept.push(text);
  }
  return { kept, truncated };
}
