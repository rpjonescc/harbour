import { canonicalise, matchKey, termPattern } from "./canonical";
import { containsAny, isDeniedByNames } from "./deny-lists";
import { cutExcerpts, EXCERPT_CHARS } from "./excerpt";
import { hasPrivateCue } from "./frame-checks";
import { hasPersonalData } from "./personal-data";
import { type Compiled, compileRules, type RedactRules, redactFull } from "./redact";
import { type Hit, MAX_HIT_CHARS } from "./schema";

// Bounds for one product's text hits: what Harbour reads, in work and in output (spec §18).
const MAX_HITS = 300;
const MAX_TOTAL_CHARS = 100_000;
const MAX_MILLISECONDS = 1_000;
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
  if (hasPrivateCue(canonical) || hasPersonalData(canonical)) return [];
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

type Frame = { hit: Hit; chars: number };

/**
 * One frame per distinct text (the letters only, so a clock or counter that changed does not make
 * a new frame), earliest first, then evenly spread over the day until the work budget fits: the
 * budget is spent on frames from the whole day, not on the first ones.
 */
function chooseFrames(hits: readonly Hit[]): { frames: Frame[]; truncated: boolean } {
  const ordered = hits
    .map((hit, i) => ({ hit, i, at: timeOf(hit) }))
    .filter(({ hit }) => typeof hit?.text === "string" && hit.text.length <= MAX_HIT_CHARS)
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const seen = new Set<string>();
  const distinct: Frame[] = [];
  for (const { hit } of ordered) {
    const key = lettersOnly(hit.text);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push({ hit, chars: hit.text.length });
  }
  for (let count = Math.min(distinct.length, MAX_HITS); count > 0; count -= 1) {
    const frames = spread(distinct, count);
    if (frames.reduce((sum, f) => sum + f.chars, 0) <= MAX_TOTAL_CHARS) {
      return { frames, truncated: frames.length < distinct.length };
    }
  }
  return { frames: [], truncated: distinct.length > 0 };
}

/**
 * Text hits to what a model may see (spec §18): distinct frames spread over the day; frame checks
 * (private-context cue, personal data, deny-listed names); excerpts around the content terms,
 * redacted; near-duplicates dropped; at most 30 spread evenly over the day and 24 KiB. Anything that
 * makes a rule throw is private and skipped. Work is bounded: 300 frames, 100,000 characters of
 * frames and 1 second per call; what is left over is skipped and `truncated` is set.
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
  const chosen = chooseFrames(hits);
  let truncated = chosen.truncated;
  const started = Date.now();
  const seenExcerpts = new Set<string>();
  const found: string[] = [];
  for (const { hit } of chosen.frames) {
    if (Date.now() - started > MAX_MILLISECONDS) {
      truncated = true;
      break;
    }
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
