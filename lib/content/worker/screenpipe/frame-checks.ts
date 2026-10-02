import { matchKey } from "./canonical";
import { PRIVATE_CUES } from "./private-cues";

const LETTER_OR_DIGIT = "\\p{L}\\p{N}";

/**
 * A pattern for one cue on matching keys: a whole word, with other characters allowed between
 * the letters of a cue of four or more letters ("p-a-s-s-w-o-r-d", "sign  in"). Null for a cue
 * with nothing to match.
 */
function cuePattern(cue: string): RegExp | null {
  const chars = Array.from(matchKey(cue)).filter((c) => /[\p{L}\p{N}]/u.test(c));
  if (chars.length === 0) return null;
  const between = chars.length < 4 ? "" : `[^${LETTER_OR_DIGIT}]*`;
  return new RegExp(
    `(?<![${LETTER_OR_DIGIT}])${chars.join(between)}(?:es|s)?(?![${LETTER_OR_DIGIT}])`,
    "u",
  );
}

const PATTERNS = PRIVATE_CUES.flatMap((cue) => {
  const pattern = cuePattern(cue);
  return pattern === null ? [] : [pattern];
});

/**
 * True when canonical text holds a private-context cue. The text is brought to its matching key
 * here, so zero-width characters, full-width letters and lookalike letters cannot hide a cue.
 */
export function hasPrivateCue(canonicalText: string): boolean {
  const key = matchKey(canonicalText);
  return PATTERNS.some((pattern) => pattern.test(key));
}
