/** Shape of a file handed to the repository checks. */
export type SourceFile = { path: string; content: string };

export type Limit = { label: string; pattern: RegExp; soft: number; hard: number };

export type SizeViolation = { path: string; lines: number; limit: number; label: string };

export type SizeReport = { errors: SizeViolation[]; warnings: SizeViolation[] };

// Order matters: the first matching pattern wins, so tests come before components.
export const LIMITS: Limit[] = [
  { label: "tests", pattern: /\.(test|spec)\.tsx?$/, soft: 400, hard: 600 },
  { label: "components", pattern: /\.tsx$/, soft: 200, hard: 300 },
  { label: "typescript", pattern: /\.(ts|mts)$/, soft: 300, hard: 400 },
  { label: "css", pattern: /\.css$/, soft: 300, hard: 500 },
];

const EXCLUDED = [/^drizzle\//, /^node_modules\//, /^\.next\//, /\.d\.ts$/, /^\.superpowers\//];

/** Returns the size limit that applies to a repo-relative path, if any. */
export function limitFor(path: string): Limit | undefined {
  if (EXCLUDED.some((pattern) => pattern.test(path))) return undefined;
  return LIMITS.find((limit) => limit.pattern.test(path));
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
  return trimmed.split("\n").length;
}

/** Splits files into hard-limit errors and soft-limit warnings. */
export function checkFileSizes(files: SourceFile[]): SizeReport {
  const report: SizeReport = { errors: [], warnings: [] };
  for (const file of files) {
    const limit = limitFor(file.path);
    if (!limit) continue;
    const count = countLines(file.content);
    if (count > limit.hard) {
      report.errors.push({ path: file.path, lines: count, limit: limit.hard, label: limit.label });
    } else if (count > limit.soft) {
      report.warnings.push({
        path: file.path,
        lines: count,
        limit: limit.soft,
        label: limit.label,
      });
    }
  }
  return report;
}
