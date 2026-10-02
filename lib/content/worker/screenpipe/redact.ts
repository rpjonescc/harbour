import { scrub } from "@/lib/analyst/scrub";
import { canonicalise, matchKey, skeleton, termPattern } from "./canonical";
import type { Snippet } from "./schema";

/** Apps whose text is never read: password managers, email, chat, calls, banking and payments. */
export const BUILT_IN_EXCLUDED_APPS = [
  "1password",
  "bitwarden",
  "keepass",
  "lastpass",
  "dashlane",
  "keychain",
  "mail",
  "outlook",
  "thunderbird",
  "slack",
  "discord",
  "teams",
  "whatsapp",
  "signal",
  "telegram",
  "messages",
  "messenger",
  "zoom",
  "facetime",
  "webex",
  "meet",
  "bank",
  "paypal",
  "venmo",
  "wise",
  "revolut",
  "quickbooks",
  "xero",
  "stripe",
  "private",
  "incognito",
] as const;
export const DENY_WINDOW_PATTERNS = [
  "password",
  "login",
  "sign in",
  "bank",
  "invoice",
  "payroll",
  "private",
  "incognito",
  "inbox",
  // Webmail, web chat, web banking and password managers open in a browser: the app is "Chrome",
  // so only the window title says what it is.
  "gmail",
  "webmail",
  "proton",
  "compose mail",
  "log in",
  "private browsing",
  "slack",
  "discord",
  "whatsapp",
  "messenger",
  "1password",
  "bitwarden",
  "lastpass",
  "dashlane",
  "keepass",
  "paypal",
  "online banking",
] as const;

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
// File extensions: a title like "login.ts" or "docker-compose.yml" is an editor tab, not a login page.
const FILE_NAME =
  /[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|toml|py|rs|go|rb|java|kt|swift|c|h|cpp|cs|php|sh|sql|css|scss|html|txt|csv|lock|env|ini|cfg|conf|log)(?![\w])/g;
const BROWSERS = [
  "chrome",
  "chromium",
  "firefox",
  "safari",
  "edge",
  "brave",
  "opera",
  "vivaldi",
  "arc",
  "zen",
];
const PRODUCT_BYTES = 24 * 1024;

const TLDS =
  "com|net|org|io|co|ai|app|dev|xyz|me|tv|us|uk|au|nz|ca|de|fr|nl|se|eu|ch|es|it|in|ru|cn|jp|to|cc|ly|" +
  "info|biz|site|online|store|tech|page|link|cloud|example|test|invalid|local|internal|localhost|" +
  "shop|gov|edu|zip|mov|top|club|live|news|blog|work|space|world|pro|name|mobi|asia|win|bid|click|" +
  "icu|rest|fun|vip|lol|wtf|onion|download|support|email|team|tools";
const SLUG = "[\\w.~@%+=-]+";

type Replacement = string | ((match: string) => string);
type Rule = readonly [RegExp, Replacement];

/** Cuts every match of `pattern` (run on the matching copy) out of `text` at the same offsets. */
function replaceOn(text: string, pattern: RegExp, to: Replacement): string {
  let out = "";
  let last = 0;
  for (const match of skeleton(text).matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    out += text.slice(last, start) + (typeof to === "string" ? to : to(text.slice(start, end)));
    last = end;
  }
  return out + text.slice(last);
}

/** The product's own host in lower case, without scheme, "www." or path; "" when there is none. */
function bareHost(host: unknown): string {
  if (typeof host !== "string") return "";
  const cleaned = matchKey(host)
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "");
  return cleaned.split(/[/?#:]/)[0] ?? "";
}

/**
 * Link-like text, most specific first. The product's own bare host is kept only when it is the
 * whole match: "docs.example.com.attacker.example/x" is a link, as is the host followed by a path.
 */
function linkRules(host: string): Rule[] {
  const keepOwnHost = (match: string): string =>
    host !== "" && match.toLowerCase() === host ? match : "[link]";
  return [
    [/[a-z][a-z0-9+.-]{1,15}:\/\/\S+/gi, "[link]"],
    [/\b(?:mailto|data|javascript|file|tel):\S+/gi, "[link]"],
    [/\bwww\.\S+/gi, "[link]"],
    // No TLD needed ("sam@localhost"); a domain split off by a line break is taken with it.
    [/[^\s@<>"'()]+@[^\s@<>"'()]+(?:\s\.[a-z]{2,})*/gi, "[email]"],
    [
      // A listed TLD makes a bare host a link; any TLD does once a path, query or port follows.
      new RegExp(
        `(?<![\\w@-])(?:[a-z0-9-]+\\.)+(?:(?:${TLDS})(?![\\w-])(?:[/?#]\\S*|:\\d\\S*)?|[a-z]{2,}(?:[/?#]\\S*|:\\d\\S*))`,
        "gi",
      ),
      keepOwnHost,
    ],
  ];
}

// After the secret rules: a key like "sk-abcdef12345678" is one token, not a token and a phone number.
const NUMBER_RULES: Rule[] = [
  [/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.]\d)/g, "[ip]"],
  [/(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}(?![0-9a-f:])/gi, "[ip]"],
  // Any separator between digits: a card number split by dots, slashes or underscores is still one.
  [/(?<!\d)\d(?:[\s.,\-_/]?\d){12,}(?!\d)/g, "[number]"],
  [/(?<!\d)\+?\d[\d\s().,-]{6,}\d(?!\d)/g, "[phone]"],
];

const SECRET_RULES: Rule[] = [
  [/(?<![\w@.])@\w{2,}/g, "[handle]"],
  [/\bauthorization\s*[:=]\s*(?:bearer|basic|token)?\s*\S+/gi, "[redacted]"],
  [/\b(?:password|passwd|passcode)\s+(?:is\s+)?\S+/gi, "[redacted]"],
  // A name ending in a secret word ("DB_PASSWORD", "client_secret") and its value.
  [
    /(?<![\w-])[\w-]*(?:password|passwd|pwd|pass|passcode|pin|secret|api[ _-]?key|apikey|token|auth)\s*[:=]\s*\S+/gi,
    "[redacted]",
  ],
  // Paths before tokens, so a long path reads as a path.
  [new RegExp(`(?<![\\w/])\\/(?:${SLUG}\\/)+(?:${SLUG})?`, "g"), "[path]"],
  [/(?<![\w/])[A-Za-z]:\\\S+/g, "[path]"],
  [new RegExp(`(?<![\\w/])${SLUG}(?:\\/${SLUG}){2,}`, "g"), "[path]"],
  [/\beyJ[\w-]{8,}\.[\w-]+(?:\.[\w-]*)?/g, "[token]"],
  [/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat|xox[abprs])[-_][\w-]{8,}/gi, "[token]"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{12,}/g, "[token]"],
  [/[0-9a-f]{24,}/gi, "[token]"],
  [/(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+/_-]*\d)[A-Za-z0-9+/_-]{24,}={0,2}/g, "[token]"],
  [/(?<![A-Za-z])(?=[A-Za-z]*[a-z])(?=[A-Za-z]*[A-Z])[A-Za-z]{24,}(?![A-Za-z])/g, "[token]"],
];

type Compiled = {
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
function compile(rules: RedactRules): Compiled {
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

const hasWord = (haystack: string, word: string): boolean =>
  new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(
    haystack,
  );

const isBrowser = (appKey: string): boolean => BROWSERS.some((name) => hasWord(appKey, name));

const containsAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Step 1: whole snippets from apps and windows that must never be read. An app or window that is
 * missing, empty or not text is unknown, and unknown is private.
 */
function isExcluded(snippet: Snippet, compiled: Compiled): boolean {
  const { app, window } = snippet;
  if (typeof app !== "string" || typeof window !== "string") return true;
  const appKey = matchKey(app);
  const windowKey = matchKey(window);
  if (appKey === "" || windowKey === "") return true;
  const titleKey = windowKey.replace(FILE_NAME, " ");
  // A browser tab can be webmail or chat, so the window title is held to the app list as well.
  return (
    containsAny(appKey, compiled.excluded) ||
    containsAny(titleKey, DENY_WINDOW_PATTERNS) ||
    ((isBrowser(appKey) || compiled.excluded.includes(windowKey)) &&
      compiled.excluded.some((name) => hasWord(windowKey, name)))
  );
}

/**
 * Steps 3 and 4 for one snippet's canonical text: redact all of it, then cap. Tags go first and
 * then backticks and angle brackets (which could close a prompt fence or open a tag), removed
 * rather than spaced so a secret or term split by them is whole again before any rule runs.
 */
function redact(canonical: string, compiled: Compiled): string {
  let text = canonical.replace(/<\/?[a-z!][^>]*>/gi, "").replace(/[`<>]/g, "");
  for (const pattern of compiled.never) text = replaceOn(text, pattern, "[removed]");
  for (const [pattern, to] of compiled.rules) text = replaceOn(text, pattern, to);
  return Array.from(canonicalise(scrub(text)))
    .slice(0, SNIPPET_CHARS)
    .join("");
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
  const compiled = compile(rules);
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
