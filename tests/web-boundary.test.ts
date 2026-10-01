import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// The web process must never bundle the scan's network side: the collectors, their fetch
// stack, the registry or the worker's wiring (they pull in node:http, google-auth-library…).
const ROOT = resolve(__dirname, "..");
const FORBIDDEN_FILES = [
  /^lib\/scan\/collectors\//,
  /^lib\/actions\/rule-sync-store\.ts$/,
  /^lib\/analyst\/(export|export-product)\.ts$/,
  /^lib\/jobs\/(agent-output|import-retry)\.ts$/,
  /^lib\/scan\/(registry|run-scan|scan-bounds|worker-deps|fetch|http-request|robots-gate)\.ts$/,
];
const FORBIDDEN_PACKAGES = ["google-auth-library", "node:http", "node:https", "node-html-parser"];
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
// Value imports only: `import type` is erased at build time.
const IMPORT =
  /(?:^|\n)\s*(?:import(?!\s+type\b)[^"';]*?from\s*|import\s*|export[^"';]*?from\s*)["']([^"']+)["']/g;
const DYNAMIC = /import\(\s*["']([^"']+)["']\s*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? relative(ROOT, resolve(ROOT, dirname(from), specifier))
      : null;
  if (base === null) return null;
  const found = ["", ...EXTENSIONS]
    .map((ext) => base + ext)
    .find((p) => {
      const full = join(ROOT, p);
      return existsSync(full) && statSync(full).isFile();
    });
  return found ?? null;
}

function importsOf(file: string): string[] {
  const text = readFileSync(join(ROOT, file), "utf8");
  return [...text.matchAll(IMPORT), ...text.matchAll(DYNAMIC)].flatMap((m) => (m[1] ? [m[1]] : []));
}

/** Every forbidden module reachable from `entries`, with the chain that reaches it. */
function violations(entries: string[]): string[] {
  const seen = new Map<string, string[]>(entries.map((e) => [e, [e]]));
  const queue = [...entries];
  const found: string[] = [];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const chain = seen.get(file) ?? [file];
    for (const specifier of importsOf(file)) {
      if (FORBIDDEN_PACKAGES.includes(specifier)) found.push([...chain, specifier].join(" → "));
      const target = resolveImport(file, specifier);
      if (!target || seen.has(target)) continue;
      if (FORBIDDEN_FILES.some((re) => re.test(target))) found.push([...chain, target].join(" → "));
      seen.set(target, [...chain, target]);
      queue.push(target);
    }
  }
  return found;
}

describe("web import boundary", () => {
  it("app/ and components/ never reach the collectors or the worker's scan wiring", () => {
    expect(violations([...sourceFiles("app"), ...sourceFiles("components")])).toEqual([]);
  });

  it("catches a forbidden import through a chain", () => {
    expect(violations(["worker/index.ts"]).length).toBeGreaterThan(0);
  });
});
