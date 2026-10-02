import { isPlainText } from "@/lib/explain/voice/note";
import { canonicalise, matchKey, termPattern } from "./canonical";
import { PRIVACY_WORDS } from "./privacy-words";

export const THEME_KINDS = ["built", "fixed", "learned", "decided", "explored"] as const;
export type ThemeKind = (typeof THEME_KINDS)[number];
export type RawTheme = { productId: string; text: string; kind: ThemeKind };
export type Theme = RawTheme & { id: string };
export type ThemeRules = {
  products: readonly { id: string; name: string }[];
  neverMention: readonly string[];
};

const PER_PRODUCT = 6;
const MAX_THEMES = 24;
const MIN_CHARS = 20;
const MAX_CHARS = 160;

const DIGIT = /\d/;
// Anything that could address a place, person or secret: a slash, an at sign, a dot between
// letters (a domain or file name), a colon before a slash, or a long unbroken run.
const IDENTIFIER = /[\\/@]|\p{L}\.\p{L}|:\/\/|[A-Za-z0-9+_=-]{24,}|\p{L}{20,}/u;

/** The term as a whole word, with an optional common ending ("loans", "doctors", "taxed"). */
function wordPattern(term: string, endings = ""): RegExp | null {
  const base = termPattern(term);
  return base && new RegExp(`(?<![\\p{L}\\p{N}])${base.source}${endings}(?![\\p{L}\\p{N}])`, "iu");
}
const PRIVACY = PRIVACY_WORDS.flatMap((w) => {
  const pattern = wordPattern(w, "(?:s|es|ed|er|ers|ing)?");
  return pattern ? [pattern] : [];
});

const mentions = (key: string, patterns: readonly RegExp[]) =>
  patterns.some((p) => key.search(p) >= 0);

/** Names to refuse in a theme: for each other product, its name and its id spelled as words. */
function otherProductPatterns(rules: ThemeRules, ownId: string): RegExp[] {
  return rules.products
    .filter((p) => p.id !== ownId)
    .flatMap((p) => [wordPattern(p.name), wordPattern(p.id)])
    .filter((p): p is RegExp => p !== null);
}

const isKind = (kind: unknown): kind is ThemeKind =>
  typeof kind === "string" && (THEME_KINDS as readonly string[]).includes(kind);

/**
 * Why a theme is not safe to keep (never shown), or null when it is (spec §8.2). Every field is
 * checked at run time: a theme is agent output, and an unknown value is a refusal, not a default.
 */
function problem(theme: RawTheme, rules: ThemeRules, never: readonly RegExp[]): string | null {
  const { text } = theme;
  if (typeof text !== "string" || typeof theme.productId !== "string") return "not text";
  if (!isKind(theme.kind)) return "unknown kind";
  if (!rules.products.some((p) => p.id === theme.productId)) return "unknown product";
  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return "length";
  if (!isPlainText(text)) return "not plain text";
  // A theme is refused as written, never repaired; but it is matched in canonical form, so a
  // full-width digit or a lookalike letter cannot get past a rule.
  const key = matchKey(canonicalise(text));
  if (DIGIT.test(key)) return "digit";
  if (IDENTIFIER.test(text) || IDENTIFIER.test(key)) return "identifier";
  if (mentions(key, never)) return "never-mention";
  if (mentions(key, otherProductPatterns(rules, theme.productId))) return "another product";
  return mentions(key, PRIVACY) ? "personal topic" : null;
}

/**
 * The themes that pass every rule, numbered t1.. in order, and how many were dropped. A dropped
 * theme's text is never kept or reported: only the count is. Kept themes are rebuilt from the
 * three known fields, so nothing else on an agent's object travels on.
 */
export function validateThemes(
  raw: readonly RawTheme[],
  rules: ThemeRules,
): { themes: Theme[]; dropped: number } {
  if (!Array.isArray(raw)) return { themes: [], dropped: 1 };
  const never = rules.neverMention.flatMap((term) => {
    const pattern = typeof term === "string" ? termPattern(term) : null;
    return pattern ? [pattern] : [];
  });
  const perProduct = new Map<string, number>();
  const themes: Theme[] = [];
  for (const theme of raw) {
    if (themes.length >= MAX_THEMES || !theme || problem(theme, rules, never) !== null) continue;
    const count = perProduct.get(theme.productId) ?? 0;
    if (count >= PER_PRODUCT) continue;
    perProduct.set(theme.productId, count + 1);
    themes.push({
      id: `t${themes.length + 1}`,
      productId: theme.productId,
      text: theme.text.trim(),
      kind: theme.kind,
    });
  }
  return { themes, dropped: raw.length - themes.length };
}
