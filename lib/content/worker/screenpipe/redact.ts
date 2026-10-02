import { redactSensitive } from "@/lib/analyst/scrub";
import { canonicalise, matchKey, termPattern } from "./canonical";
import { BUILT_IN_EXCLUDED_APPS, containsAny, isDeniedByNames } from "./deny-lists";
import {
  bareHost,
  linkRules,
  NUMBER_RULES,
  type Rule,
  replaceOn,
  SECRET_RULES,
} from "./redact-rules";
import type { Snippet } from "./schema";

export type RedactRules = {
  excludeApps: readonly string[];
  terms: readonly string[];
  productHost: string;
  neverMention: readonly string[];
};

const SNIPPET_CHARS = 240;
// The schema already caps a snippet at this; a longer one is refused rather than cut, because a
// cut before redaction can leave a fragment of a secret or a forbidden term.
const MAX_INPUT_CHARS = 10_000;
// One call's work is bounded however many snippets arrive: the rest are dropped and `truncated`
// is set, so a hostile batch cannot hold the worker.
const MAX_SNIPPETS = 100;
const MAX_TOTAL_CHARS = 200_000;
const PRODUCT_BYTES = 24 * 1024;

export type Compiled = {
  excluded: string[];
  terms: string[];
  never: RegExp[];
  rules: Rule[];
};

const keys = (values: readonly unknown[]): string[] =>
  values
    .filter((v): v is string => typeof v === "string")
    .map(matchKey)
    .filter((k) => k !== "");

/** Compiles the rules once per run; a rule with no usable text (an empty term) is left out. */
export function compileRules(rules: RedactRules): Compiled {
  return {
    excluded: keys([...BUILT_IN_EXCLUDED_APPS, ...rules.excludeApps]),
    terms: keys(rules.terms),
    never: rules.neverMention.flatMap((t) => {
      const pattern = typeof t === "string" ? termPattern(t) : null;
      return pattern === null ? [] : [pattern];
    }),
    rules: [...linkRules(bareHost(rules.productHost)), ...SECRET_RULES, ...NUMBER_RULES],
  };
}

/**
 * Step 3 for canonical text: redact all of it, uncapped. Tags go first and then backticks and
 * angle brackets (which could close a prompt fence or open a tag), removed rather than spaced so a
 * secret or term split by them is whole again before any rule runs.
 */
export function redactFull(canonical: string, compiled: Compiled): string {
  let text = canonical.replace(/<\/?[a-z!][^>]*>/gi, "").replace(/[`<>]/g, "");
  for (const pattern of compiled.never) text = replaceOn(text, pattern, "[removed]");
  for (const [pattern, to] of compiled.rules) text = replaceOn(text, pattern, to);
  return canonicalise(redactSensitive(text));
}

/** Step 4 for one snippet: redact, then cap at 240 characters. */
const redact = (canonical: string, compiled: Compiled): string =>
  Array.from(redactFull(canonical, compiled)).slice(0, SNIPPET_CHARS).join("");

/**
 * Step 1 for a snippet: whole snippets from apps and windows that must never be read. An app or
 * window that is missing, empty or not text is unknown, and unknown is private.
 */
function isExcluded(snippet: Snippet, compiled: Compiled): boolean {
  const { app, window } = snippet;
  if (typeof app !== "string" || typeof window !== "string") return true;
  if (matchKey(app) === "" || matchKey(window) === "") return true;
  return isDeniedByNames(app, window, compiled.excluded);
}

/**
 * Screen text to what a model may see (spec §5.3), in memory and in this order: drop excluded
 * apps and windows; keep only on-topic text; redact; normalise and cap (240 characters each, 24
 * KiB per product). Anything uncertain, including a snippet that makes a rule throw, is treated
 * as private. Snippets arrive in Screenpipe's response order: the response carries no per-snippet
 * time in this schema, so "oldest dropped first" cannot be honoured and the cap keeps the first
 * snippets (at 30 snippets of 240 characters it never binds).
 */
export function filterSnippets(
  snippets: readonly Snippet[],
  rules: RedactRules,
): { kept: string[]; truncated: boolean } {
  const compiled = compileRules(rules);
  const kept: string[] = [];
  let bytes = 0;
  let chars = 0;
  const truncated = snippets.length > MAX_SNIPPETS;
  for (const snippet of snippets.slice(0, MAX_SNIPPETS)) {
    chars += typeof snippet?.text === "string" ? snippet.text.length : 0;
    if (chars > MAX_TOTAL_CHARS) return { kept, truncated: true };
    const text = redactOne(snippet, compiled);
    if (text === null) continue;
    const size = Buffer.byteLength(text, "utf8") + 1;
    if (bytes + size > PRODUCT_BYTES) return { kept, truncated: true };
    bytes += size;
    kept.push(text);
  }
  return { kept, truncated };
}

function redactOne(snippet: Snippet, compiled: Compiled): string | null {
  try {
    if (typeof snippet.text !== "string" || isExcluded(snippet, compiled)) return null;
    const canonical = canonicalise(snippet.text);
    if (canonical.length > MAX_INPUT_CHARS) return null;
    if (!containsAny(matchKey(canonical), compiled.terms)) return null;
    const text = redact(canonical, compiled);
    // On topic after redaction too: a term inside a link or token must not vouch for the text around it.
    return containsAny(matchKey(text), compiled.terms) ? text : null;
  } catch {
    // Fail closed: a snippet that breaks a rule is private. Nothing about it is kept or logged.
    return null;
  }
}
