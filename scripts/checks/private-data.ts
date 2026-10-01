import type { SourceFile } from "./file-size";

export type PrivateFinding = { path: string; line: number; label: string };

const SECRET_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    label: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/,
  },
  { label: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: "OpenAI-style key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}/ },
  { label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  // Real tailnet names have 6+ hex characters; docs use fictional ones like tail1234.
  { label: "real tailnet hostname", pattern: /\b[a-z0-9-]+\.tail[0-9a-f]{6,}\.ts\.net\b/i },
  { label: "home directory path", pattern: /(?:\/home\/|\/Users\/)[A-Za-z][\w.-]*\// },
];

const SKIPPED = [/^pnpm-lock\.yaml$/, /^drizzle\/meta\//];

/** Owner terms file: one term per line; `#` comments and blank lines ignored. */
export function parseTerms(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function termPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
}

/** Secrets and owner terms in one file, at most one finding per line. */
export function findPrivateData(file: SourceFile, terms: string[]): PrivateFinding[] {
  if (SKIPPED.some((pattern) => pattern.test(file.path))) return [];
  const termPatterns = terms.map((term) => ({
    label: `term "${term}"`,
    pattern: termPattern(term),
  }));
  const patterns = [...SECRET_PATTERNS, ...termPatterns];
  const findings: PrivateFinding[] = [];
  file.content.split("\n").forEach((text, index) => {
    const hit = patterns.find(({ pattern }) => pattern.test(text));
    if (hit) findings.push({ path: file.path, line: index + 1, label: hit.label });
  });
  return findings;
}
