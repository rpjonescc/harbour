import { redactCredentials } from "@/lib/agents/brain-git";

const MAX_LENGTH = 300;
const REDACTED = "[redacted]";

// Most specific first: a PEM block or a token inside a URL is gone before emails and paths.
const RULES: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, REDACTED],
  [/\b(Bearer)\s+[^\s"']+/gi, `$1 ${REDACTED}`],
  [/\b((?:[a-z]+_)*(?:key|access_token|token|secret))=[^&\s"']+/gi, `$1=${REDACTED}`],
  [/AIza[0-9A-Za-z_-]{35}/g, REDACTED],
  [/ya29\.[0-9A-Za-z_.-]+/g, REDACTED],
  [/[^\s"'()<>@:/*]+@[^\s"'()<>@]+\.[a-z]{2,}/gi, "[email]"],
  // An absolute or home path (never the `//` of a URL).
  [/(^|[\s"'(=:,])(~|\/)(?!\/)[^\s"')]*\/[^\s"')]*/g, "$1[path]"],
];

/**
 * Text that goes into an agent prompt from Harbour's own records (collector errors, crawled
 * URLs) with secrets and identifiers removed: URL credentials, key and token parameters, Google
 * API keys and OAuth tokens, Bearer values, PEM blocks, emails and file paths. At most 300 chars.
 */
export function scrub(text: string): string {
  const clean = RULES.reduce(
    (out, [pattern, to]) => out.replace(pattern, to),
    redactCredentials(text),
  );
  return clean.slice(0, MAX_LENGTH);
}
