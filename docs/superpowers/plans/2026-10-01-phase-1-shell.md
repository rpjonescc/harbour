# Harbour Phase 1 (Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A secure, beautiful, running Harbour shell: Next.js app with the Paper & Tide design system (light/dark), two-lock auth (Tailscale identity + passkey), app layout, Today page on sample data, quality gates, and systemd + Tailscale Serve deployment.

**Architecture:** One Next.js 16 App Router app bound to `127.0.0.1:3400`. `proxy.ts` enforces Lock 1 (Tailscale identity header) and adds a nonce CSP on every request; server code enforces Lock 2 (passkey-backed session, stored hashed in SQLite via Drizzle). Pure logic lives in `lib/` with Vitest tests; routes stay thin.

**Tech Stack:** Next.js 16.3, React 19.3, TypeScript 6.0 (strict), Tailwind CSS 4.3, Drizzle ORM 0.45 + better-sqlite3 13, @simplewebauthn/server + browser 14, zod 4, Vitest 5, Playwright 1.63, Biome 2.5, lefthook 2.1, pnpm 9, Node 22.

> **Note:** This plan predates moving products into `harbour.config.json`. Here the catalog is a hardcoded list; the products shown are the same fictional examples used by `harbour.config.example.json`.

**Spec:** `docs/superpowers/specs/2026-10-01-harbour-design.md` (§3, §4, §9, §10, §13, §14 phase 1). **Repo rules:** `AGENTS.md`.

## Global Constraints

- Node 22 and pnpm 9 on `PATH`. Repo root: `<repo>` (wherever Harbour is cloned).
- Web server binds `127.0.0.1` only, port `3400` (prod) / `3401` (E2E). Never `0.0.0.0`.
- TypeScript `strict: true` + `noUncheckedIndexedAccess`; no `any`; validate external input with zod.
- File size hard limits (AGENTS.md): `.tsx` 300, `.ts` 400, tests 600, `.css` 500 lines. Soft: 200/300/400/300.
- Components use **semantic tokens only**; no hex colours outside `design/`. Text sizes in rem (Tailwind scale).
- Fonts: Newsreader (headings/reading), Inter (UI), JetBrains Mono (mono) via `next/font` (self-hosted).
- Tailscale identity header: `Tailscale-User-Login`. Allowed logins from `HARBOUR_ALLOWED_LOGINS`.
- Session: random 32-byte token, stored as SHA-256 hash, 30-day sliding expiry, bound to the Tailscale login. Cookie `harbour_session`: `HttpOnly; Secure; SameSite=Strict; Path=/`.
- Mutating API routes: require `Origin === HARBOUR_ORIGIN` and `Content-Type: application/json`.
- Passkeys are registered **only** with a single-use setup token (CLI bootstrap or "Add device" from an authenticated session). Setup token TTL 15 min; WebAuthn challenge TTL 5 min, single use.
- Timezone and locale come from config (`HARBOUR_TIMEZONE`, later defaulting to the server zone; `HARBOUR_LOCALE`, default `en-US`).
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `pnpm check` before each commit once Task 1 is done.

## File Structure

```
harbour/
  package.json, tsconfig.json, next.config.ts, postcss.config.mjs, biome.json,
  vitest.config.mts, playwright.config.ts, drizzle.config.ts, lefthook.yml,
  .env.example, .gitignore
  proxy.ts                         Lock 1 + CSP nonce (thin; logic in lib/auth/gate.ts)
  app/
    layout.tsx                     fonts, theme attribute, html shell
    globals.css                    Tailwind import + @theme mapping to semantic tokens
    login/page.tsx                 passkey sign-in
    setup/page.tsx                 passkey registration via setup token
    (app)/layout.tsx               requireSession + sidebar shell
    (app)/page.tsx                 Today
    (app)/design/page.tsx          living design system
    (app)/settings/devices/page.tsx
    api/auth/register/options/route.ts, register/verify/route.ts
    api/auth/login/options/route.ts, login/verify/route.ts, logout/route.ts
    api/devices/setup-link/route.ts, api/devices/remove/route.ts
  design/
    tokens.css                     primitives + semantic (light/dark)
    token-list.ts                  token names for /design
  components/
    ui/        Button, Panel, Tag, ProductDot, Sparkline, Delta (+ sparkline-points.ts)
    shell/     Sidebar, NavLink, ThemeToggle, LogoutButton, nav-items.ts
    today/     TodayHeader, ScoreTable, ActionCard, SampleBanner
    auth/      PasskeyLogin, PasskeySetup
    settings/  DeviceList, AddDeviceButton
  lib/
    config.ts                      zod-validated env
    db/schema.ts, db/client.ts
    auth/tailscale.ts, gate.ts, paths.ts, cookies.ts, sessions.ts, challenges.ts,
         setup-tokens.ts, passkeys.ts, devices.ts, guard.ts, request.ts, client-api.ts
    http/responses.ts, http/same-origin.ts
    security/csp.ts
    audit.ts
    products/catalog.ts
    today/sample.ts
    format/date.ts
  scripts/
    checks/file-size.ts, checks/hex-colors.ts   pure check logic (+ tests)
    check.ts                                     CLI runner for both checks
    setup-token.ts                               prints a one-time setup URL
  deploy/
    install.sh, harbour-web.service.template, README.md
  drizzle/                         generated migrations
  tests/
    helpers/db.ts
    e2e/global-setup.ts, e2e/shell.spec.ts
```

---

### Task 1: Project scaffold and quality gates

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `biome.json`, `vitest.config.mts`, `lefthook.yml`, `.env.example`, `app/layout.tsx`, `app/page.tsx` (temporary), `app/globals.css` (temporary)
- Modify: `.gitignore`

**Interfaces:**
- Produces: scripts `pnpm dev|build|start|typecheck|lint|fix|test|test:e2e|check|check:files|db:generate|setup-token`; path alias `@/*` → repo root.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "harbour",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@9.15.4",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "next dev -H 127.0.0.1 -p 3400",
    "build": "next build",
    "start": "next start -H 127.0.0.1 -p 3400",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "fix": "biome check --write .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "check:files": "tsx scripts/check.ts",
    "check": "pnpm typecheck && pnpm lint && pnpm check:files && pnpm test",
    "db:generate": "drizzle-kit generate",
    "setup-token": "tsx --env-file=.env scripts/setup-token.ts",
    "prepare": "lefthook install"
  },
  "dependencies": {
    "@simplewebauthn/browser": "^14.0.0",
    "@simplewebauthn/server": "^14.0.3",
    "better-sqlite3": "^13.0.3",
    "drizzle-orm": "^0.45.3",
    "lucide-react": "^1.49.0",
    "next": "^16.3.8",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "server-only": "^0.0.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.15",
    "@playwright/test": "^1.63.0",
    "@tailwindcss/postcss": "^4.3.3",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@types/better-sqlite3": "^9.6.0",
    "@types/node": "^22.20.4",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "drizzle-kit": "^0.31.11",
    "jsdom": "^30.1.1",
    "lefthook": "^2.1.15",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.23.15",
    "typescript": "~6.0.3",
    "vite": "^8.3.1",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["dom", "dom.iterable", "es2023"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "types": ["vitest/globals"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules", ".superpowers"]
}
```

- [ ] **Step 3: Write `next.config.ts`, `postcss.config.mjs`**

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 4: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/drizzle", "!**/brain", "!**/.superpowers", "!**/docs"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "css": { "parser": { "tailwindDirectives": true } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "noNonNullAssertion": "error" }
    }
  },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

- [ ] **Step 5: Write `vitest.config.mts`**

```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "tests/e2e/**", ".superpowers"],
    setupFiles: ["./tests/setup.ts"],
  },
});
```

Create `tests/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Write `lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,mts,mjs,js,json,css}"
      run: pnpm biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true
pre-push:
  commands:
    check:
      run: pnpm check
```

- [ ] **Step 7: Replace `.gitignore` and write `.env.example`**

`.gitignore`:
```
node_modules/
.next/
next-env.d.ts
*.tsbuildinfo
.superpowers/
data/
test-results/
playwright-report/
.env
.env.*
!.env.example
```

`.env.example`:
```bash
# Comma-separated Tailscale logins allowed into Harbour (see `tailscale status --json` → User).
HARBOUR_ALLOWED_LOGINS=you@example.com
# Public origin and WebAuthn relying-party id: your machine's MagicDNS name.
HARBOUR_ORIGIN=https://your-pc.your-tailnet.ts.net
HARBOUR_RP_ID=your-pc.your-tailnet.ts.net
HARBOUR_DB_PATH=./data/harbour.db
HARBOUR_TIMEZONE=Europe/London
# Development only: put HARBOUR_DEV_IDENTITY=you@example.com in .env.development.local
# (loaded only by `next dev`). Production refuses to start if it is set.
```

- [ ] **Step 8: Temporary app files so the build works**

`app/globals.css`:
```css
@import "tailwindcss";
```

`app/layout.tsx`:
```tsx
import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <main>Harbour</main>;
}
```

- [ ] **Step 9: Install and verify**

Run: `cd <repo> && pnpm install && pnpm typecheck && pnpm lint && pnpm build`
Expected: install succeeds, `lefthook install` runs, typecheck/lint clean, build prints a route table including `/`.
(`pnpm test` has no tests yet; Vitest exits non-zero with "No test files found" — that is expected until Task 2.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with quality tooling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: File-size and hex-colour checks

**Files:**
- Create: `scripts/checks/file-size.ts`, `scripts/checks/file-size.test.ts`, `scripts/checks/hex-colors.ts`, `scripts/checks/hex-colors.test.ts`, `scripts/check.ts`

**Interfaces:**
- Produces: `limitFor(path): Limit | undefined`, `checkFileSizes(files: SourceFile[]): SizeReport`, `findHexColors(file: SourceFile): HexFinding[]` where `SourceFile = { path: string; content: string }`.

- [ ] **Step 1: Write failing tests `scripts/checks/file-size.test.ts`**

```ts
import { checkFileSizes, limitFor } from "./file-size";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");

describe("limitFor", () => {
  it("classifies tests before components and modules", () => {
    expect(limitFor("components/x.test.tsx")?.label).toBe("tests");
    expect(limitFor("tests/e2e/shell.spec.ts")?.label).toBe("tests");
    expect(limitFor("components/ui/Button.tsx")?.label).toBe("components");
    expect(limitFor("lib/auth/sessions.ts")?.label).toBe("typescript");
    expect(limitFor("design/tokens.css")?.label).toBe("css");
  });

  it("excludes generated and vendored files", () => {
    expect(limitFor("drizzle/0000_init.sql")).toBeUndefined();
    expect(limitFor("next-env.d.ts")).toBeUndefined();
    expect(limitFor("pnpm-lock.yaml")).toBeUndefined();
    expect(limitFor("README.md")).toBeUndefined();
  });
});

describe("checkFileSizes", () => {
  it("fails files over the hard limit and warns over the soft limit", () => {
    const report = checkFileSizes([
      { path: "components/Big.tsx", content: lines(301) },
      { path: "components/Soft.tsx", content: lines(201) },
      { path: "components/Ok.tsx", content: lines(200) },
    ]);
    expect(report.errors.map((v) => v.path)).toEqual(["components/Big.tsx"]);
    expect(report.warnings.map((v) => v.path)).toEqual(["components/Soft.tsx"]);
  });

  it("does not count a trailing newline as an extra line", () => {
    const report = checkFileSizes([{ path: "components/Edge.tsx", content: `${lines(300)}\n` }]);
    expect(report.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run scripts/checks/file-size.test.ts`
Expected: FAIL — cannot resolve `./file-size`.

- [ ] **Step 3: Implement `scripts/checks/file-size.ts`**

```ts
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
      report.warnings.push({ path: file.path, lines: count, limit: limit.soft, label: limit.label });
    }
  }
  return report;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run scripts/checks/file-size.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write failing tests `scripts/checks/hex-colors.test.ts`**

```ts
import { findHexColors } from "./hex-colors";

describe("findHexColors", () => {
  it("flags hex colours in components and app code", () => {
    const findings = findHexColors({
      path: "components/ui/Bad.tsx",
      content: 'export const x = <div style={{ color: "#1f6b5a" }} className="bg-[#fff]" />;',
    });
    expect(findings.map((f) => f.match)).toEqual(["#1f6b5a", "#fff"]);
    expect(findings[0]?.line).toBe(1);
  });

  it("ignores the design token layer and non-UI files", () => {
    expect(findHexColors({ path: "design/tokens.css", content: "--x: #fff;" })).toEqual([]);
    expect(findHexColors({ path: "lib/auth/sessions.ts", content: "const id = '#abc';" })).toEqual([]);
  });

  it("does not flag anchors or ids that are not colours", () => {
    const findings = findHexColors({ path: "app/page.tsx", content: '<a href="#main">Skip</a>' });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm vitest run scripts/checks/hex-colors.test.ts`
Expected: FAIL — cannot resolve `./hex-colors`.

- [ ] **Step 7: Implement `scripts/checks/hex-colors.ts`**

```ts
import type { SourceFile } from "./file-size";

export type HexFinding = { path: string; line: number; match: string };

const UI_PATHS = /^(app|components)\/.*\.(tsx|ts|css)$/;
// 3, 4, 6 or 8 hex digits, not followed by more word characters (so "#main" never matches).
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

/** Finds hardcoded hex colours in UI code; colours must come from design tokens. */
export function findHexColors(file: SourceFile): HexFinding[] {
  if (!UI_PATHS.test(file.path)) return [];
  const findings: HexFinding[] = [];
  file.content.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(HEX)) {
      findings.push({ path: file.path, line: index + 1, match: match[0] });
    }
  });
  return findings;
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm vitest run scripts/checks`
Expected: PASS (7 tests).

- [ ] **Step 9: Write CLI `scripts/check.ts`**

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { checkFileSizes, type SourceFile } from "./checks/file-size";
import { findHexColors } from "./checks/hex-colors";

function trackedFiles(): SourceFile[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return output
    .split("\n")
    .filter((path) => path.length > 0 && existsSync(path))
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

const files = trackedFiles();
const sizes = checkFileSizes(files);
const colours = files.flatMap(findHexColors);

for (const w of sizes.warnings) {
  console.warn(`warn  ${w.path}: ${w.lines} lines (soft limit ${w.limit} for ${w.label}) — consider splitting`);
}
for (const e of sizes.errors) {
  console.error(`error ${e.path}: ${e.lines} lines (hard limit ${e.limit} for ${e.label}) — split this file`);
}
for (const c of colours) {
  console.error(`error ${c.path}:${c.line}: hardcoded colour ${c.match} — use a semantic token`);
}

if (sizes.errors.length > 0 || colours.length > 0) process.exit(1);
console.log(`files ok (${files.length} checked, ${sizes.warnings.length} soft warnings)`);
```

- [ ] **Step 10: Add the check to the pre-commit hook and run the full gate**

In `lefthook.yml`, add under `pre-commit.commands` (after `biome`):
```yaml
    files:
      run: pnpm check:files
```
Then run: `pnpm lefthook install && pnpm check`
Expected: typecheck, lint, `files ok (...)`, tests all pass.

- [ ] **Step 11: Commit**

```bash
git add scripts lefthook.yml
git commit -m "feat: enforce file-size limits and token-only colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Design tokens, fonts and theme

**Files:**
- Create: `design/tokens.css`, `design/token-list.ts`, `lib/theme.ts`, `lib/theme.test.ts`
- Modify: `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--bg --surface --surface-sunk --line --ink --ink-muted --accent --accent-soft --accent-ink --good --warn --warn-soft --bad --focus --product-acme --product-lighthouse --product-fernfield`; Tailwind colour utilities `bg-bg`, `bg-surface`, `bg-surface-sunk`, `border-line`, `text-ink`, `text-ink-muted`, `bg-accent`, `text-accent`, `bg-accent-soft`, `text-accent-ink`, `text-good`, `text-warn`, `bg-warn-soft`, `text-bad`; font utilities `font-serif`, `font-sans`, `font-mono`.
- Produces: `type ThemePreference = "system" | "light" | "dark"`, `THEME_COOKIE = "harbour-theme"`, `parseTheme(value: string | undefined): ThemePreference`, `nextTheme(current: ThemePreference): ThemePreference`, `SEMANTIC_TOKENS: readonly { name: string; role: string }[]`.

- [ ] **Step 1: Write failing test `lib/theme.test.ts`**

```ts
import { nextTheme, parseTheme } from "./theme";

describe("theme preference", () => {
  it("parses known values and defaults to system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("purple")).toBe("system");
  });

  it("cycles system → light → dark → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/theme.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `lib/theme.ts`**

```ts
export type ThemePreference = "system" | "light" | "dark";

export const THEME_COOKIE = "harbour-theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];

/** Reads a stored preference, falling back to following the OS. */
export function parseTheme(value: string | undefined): ThemePreference {
  return ORDER.includes(value as ThemePreference) ? (value as ThemePreference) : "system";
}

/** The preference the theme toggle moves to next. */
export function nextTheme(current: ThemePreference): ThemePreference {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length] ?? "system";
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run lib/theme.test.ts` → PASS.

- [ ] **Step 5: Write `design/tokens.css`**

```css
/* Harbour design tokens — "Paper & Tide".
 * Layer 1: primitives (raw values). Layer 2: semantic tokens (what components use).
 * Components must only reference semantic tokens. */

:root {
  /* Primitives: paper */
  --paper-50: #fffdf8;
  --paper-100: #f6f2ea;
  --paper-200: #efe9dd;
  --paper-300: #e2dacb;
  --paper-500: #8a8478;
  --paper-900: #2b2a27;
  /* Primitives: night (dark surfaces) */
  --night-950: #121416;
  --night-900: #16181a;
  --night-800: #1d2023;
  --night-700: #2a2e32;
  --night-400: #8d887e;
  --night-100: #e8e2d6;
  /* Primitives: tide (accent) */
  --tide-100: #dcebe5;
  --tide-300: #6fbfa8;
  --tide-700: #1f6b5a;
  --tide-900: #1d3a33;
  /* Primitives: signal colours */
  --amber-100: #f4e5cf;
  --amber-300: #e0a35c;
  --amber-700: #a8641c;
  --amber-900: #3a2d1c;
  --clay-300: #e07a6e;
  --clay-700: #a63d32;
  --fern-300: #86c493;
  --fern-700: #3d7a4a;
  /* Primitives: product hues */
  --acme-300: #e0a35c;
  --acme-600: #c9822e;
  --lighthouse-300: #a98bd4;
  --lighthouse-600: #7b5ea7;
  --fernfield-300: #7fb3d6;
  --fernfield-600: #3f7fa8;

  /* Non-colour primitives */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-hairline: 0 1px 0 var(--line);
  --duration-fast: 120ms;
  --duration-base: 200ms;
}

/* Semantic: light (default) */
:root,
[data-theme="light"] {
  color-scheme: light;
  --bg: var(--paper-100);
  --surface: var(--paper-50);
  --surface-sunk: var(--paper-200);
  --line: var(--paper-300);
  --ink: var(--paper-900);
  --ink-muted: var(--paper-500);
  --accent: var(--tide-700);
  --accent-soft: var(--tide-100);
  --accent-ink: var(--paper-50);
  --good: var(--fern-700);
  --warn: var(--amber-700);
  --warn-soft: var(--amber-100);
  --bad: var(--clay-700);
  --focus: var(--tide-700);
  --product-acme: var(--acme-600);
  --product-lighthouse: var(--lighthouse-600);
  --product-fernfield: var(--fernfield-600);
}

/* Semantic: dark — "lamp-lit paper" */
@media (prefers-color-scheme: dark) {
  [data-theme="system"] {
    color-scheme: dark;
    --bg: var(--night-900);
    --surface: var(--night-800);
    --surface-sunk: var(--night-950);
    --line: var(--night-700);
    --ink: var(--night-100);
    --ink-muted: var(--night-400);
    --accent: var(--tide-300);
    --accent-soft: var(--tide-900);
    --accent-ink: var(--night-950);
    --good: var(--fern-300);
    --warn: var(--amber-300);
    --warn-soft: var(--amber-900);
    --bad: var(--clay-300);
    --focus: var(--tide-300);
    --product-acme: var(--acme-300);
    --product-lighthouse: var(--lighthouse-300);
    --product-fernfield: var(--fernfield-300);
  }
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: var(--night-900);
  --surface: var(--night-800);
  --surface-sunk: var(--night-950);
  --line: var(--night-700);
  --ink: var(--night-100);
  --ink-muted: var(--night-400);
  --accent: var(--tide-300);
  --accent-soft: var(--tide-900);
  --accent-ink: var(--night-950);
  --good: var(--fern-300);
  --warn: var(--amber-300);
  --warn-soft: var(--amber-900);
  --bad: var(--clay-300);
  --focus: var(--tide-300);
  --product-acme: var(--acme-300);
  --product-lighthouse: var(--lighthouse-300);
  --product-fernfield: var(--fernfield-300);
}
```

- [ ] **Step 6: Write `app/globals.css`**

```css
@import "tailwindcss";
@import "../design/tokens.css";

/* Remove Tailwind's default palette so only semantic colours exist. */
@theme {
  --color-*: initial;
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-sunk: var(--surface-sunk);
  --color-line: var(--line);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);
  --color-accent-ink: var(--accent-ink);
  --color-good: var(--good);
  --color-warn: var(--warn);
  --color-warn-soft: var(--warn-soft);
  --color-bad: var(--bad);
  --color-focus: var(--focus);
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-serif: var(--font-newsreader), Georgia, serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}

@layer base {
  html {
    background: var(--bg);
    color: var(--ink);
  }
  body {
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0ms !important;
      animation-duration: 0ms !important;
    }
  }
}
```

- [ ] **Step 7: Write `design/token-list.ts`**

```ts
/** Semantic tokens shown on the /design page. Keep in sync with design/tokens.css. */
export const SEMANTIC_TOKENS = [
  { name: "--bg", role: "Page background" },
  { name: "--surface", role: "Raised panels and cards" },
  { name: "--surface-sunk", role: "Sidebar and recessed areas" },
  { name: "--line", role: "Borders and dividers" },
  { name: "--ink", role: "Primary text" },
  { name: "--ink-muted", role: "Secondary text" },
  { name: "--accent", role: "Primary actions and links" },
  { name: "--accent-soft", role: "Accent backgrounds" },
  { name: "--good", role: "Improvement" },
  { name: "--warn", role: "Needs attention" },
  { name: "--warn-soft", role: "Attention backgrounds" },
  { name: "--bad", role: "Regression or failure" },
  { name: "--product-acme", role: "Acme Docs" },
  { name: "--product-lighthouse", role: "Lighthouse Café" },
  { name: "--product-fernfield", role: "Fern & Field" },
] as const;
```

- [ ] **Step 8: Rewrite `app/layout.tsx` with fonts and theme attribute**

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Harbour",
  description: "Home control centre",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en-US"
      data-theme={theme}
      className={`${inter.variable} ${newsreader.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-bg text-ink">{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Verify build and checks**

Run: `pnpm check && pnpm build`
Expected: all pass; build succeeds (fonts downloaded at build time).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Paper & Tide design tokens with light and dark themes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: UI primitives

**Files:**
- Create: `components/ui/Button.tsx`, `components/ui/Panel.tsx`, `components/ui/Tag.tsx`, `components/ui/ProductDot.tsx`, `components/ui/Sparkline.tsx`, `components/ui/sparkline-points.ts`, `components/ui/sparkline-points.test.ts`, `components/ui/Delta.tsx`, `components/ui/Delta.test.tsx`, `lib/products/catalog.ts`, `lib/products/catalog.test.ts`

**Interfaces:**
- Produces:
  - `Button(props: ButtonHTMLAttributes & { variant?: "primary" | "ghost" })`
  - `Panel({ children, className? })`
  - `Tag({ tone?: "accent" | "warn" | "neutral", children })`
  - `ProductDot({ productId: ProductId })`
  - `Sparkline({ values: number[], label: string })`, `sparklinePoints(values: number[], width: number, height: number): string`
  - `Delta({ value: number })` — renders ▲/▼ with screen-reader text, nothing for 0
  - `PRODUCTS`, `type ProductId = "acme-docs" | "lighthouse-cafe" | "fern-and-field"`, `type Product = { id; name; url; colorVar }`, `productById(id: ProductId): Product`

- [ ] **Step 1: Write failing tests**

`lib/products/catalog.test.ts`:
```ts
import { PRODUCTS, productById } from "./catalog";

describe("product catalog", () => {
  it("lists the three products in display order", () => {
    expect(PRODUCTS.map((p) => p.id)).toEqual(["acme-docs", "lighthouse-cafe", "fern-and-field"]);
  });

  it("looks up a product by id", () => {
    expect(productById("fern-and-field").url).toBe("https://fernandfield.example.com");
    expect(productById("acme-docs").colorVar).toBe("--product-acme");
  });
});
```

`components/ui/sparkline-points.test.ts`:
```ts
import { sparklinePoints } from "./sparkline-points";

describe("sparklinePoints", () => {
  it("maps values onto the box with higher values nearer the top", () => {
    expect(sparklinePoints([0, 10], 60, 20)).toBe("0,19 60,1");
  });

  it("draws a flat line in the middle when all values are equal", () => {
    expect(sparklinePoints([5, 5, 5], 60, 20)).toBe("0,10 30,10 60,10");
  });

  it("returns an empty string for fewer than two values", () => {
    expect(sparklinePoints([7], 60, 20)).toBe("");
    expect(sparklinePoints([], 60, 20)).toBe("");
  });
});
```

`components/ui/Delta.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Delta } from "./Delta";

describe("Delta", () => {
  it("announces increases", () => {
    render(<Delta value={3} />);
    expect(screen.getByText("up 3")).toBeInTheDocument();
  });

  it("announces decreases", () => {
    render(<Delta value={-2} />);
    expect(screen.getByText("down 2")).toBeInTheDocument();
  });

  it("renders nothing for no change", () => {
    const { container } = render(<Delta value={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/products components/ui` → FAIL (modules missing).

- [ ] **Step 3: Implement `lib/products/catalog.ts`**

```ts
export type ProductId = "acme-docs" | "lighthouse-cafe" | "fern-and-field";

export type Product = { id: ProductId; name: string; url: string; colorVar: string };

/** Products Harbour watches, in display order. */
export const PRODUCTS: readonly Product[] = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", colorVar: "--product-acme" },
  {
    id: "lighthouse-cafe",
    name: "Lighthouse Café",
    url: "https://lighthouse-cafe.example.com",
    colorVar: "--product-lighthouse",
  },
  { id: "fern-and-field", name: "Fern & Field", url: "https://fernandfield.example.com", colorVar: "--product-fernfield" },
];

/** Looks up a product; ids are a closed union so this always succeeds. */
export function productById(id: ProductId): Product {
  const product = PRODUCTS.find((p) => p.id === id);
  if (!product) throw new Error(`Unknown product: ${id}`);
  return product;
}
```

- [ ] **Step 4: Implement `components/ui/sparkline-points.ts`**

```ts
const PADDING = 1;

/** Converts a series into SVG polyline points inside a width × height box. */
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = width / (values.length - 1);
  const usable = height - PADDING * 2;
  return values
    .map((value, index) => {
      const x = Math.round(index * step);
      const y = range === 0 ? height / 2 : PADDING + usable - ((value - min) / range) * usable;
      return `${x},${Math.round(y)}`;
    })
    .join(" ");
}
```

- [ ] **Step 5: Implement the components**

`components/ui/Delta.tsx`:
```tsx
/** Small trend arrow with screen-reader text; renders nothing when unchanged. */
export function Delta({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span className={`ml-1 text-2xs ${up ? "text-good" : "text-bad"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{`${up ? "up" : "down"} ${Math.abs(value)}`}</span>
    </span>
  );
}
```

Note: `text-2xs` is defined in this step — add to the `@theme inline` block in `app/globals.css`:
```css
  --text-2xs: 0.6875rem;
  --text-2xs--line-height: 1rem;
```

`components/ui/Sparkline.tsx`:
```tsx
import { sparklinePoints } from "./sparkline-points";

const WIDTH = 60;
const HEIGHT = 18;

/** Tiny trend line; `label` describes the trend for screen readers. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  return (
    <svg role="img" aria-label={label} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <polyline
        points={sparklinePoints(values, WIDTH, HEIGHT)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

`components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  ghost: "border border-line text-ink-muted hover:text-ink hover:bg-surface-sunk",
};

/** Harbour button. Always pass `type` explicitly inside forms. */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
```

`components/ui/Panel.tsx`:
```tsx
import type { ReactNode } from "react";

/** Raised surface with a hairline border. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-line bg-surface ${className}`}>{children}</div>
  );
}
```

`components/ui/Tag.tsx`:
```tsx
import type { ReactNode } from "react";

type Tone = "accent" | "warn" | "neutral";

const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  neutral: "bg-surface-sunk text-ink-muted",
};

/** Small rounded label. */
export function Tag({ tone = "accent", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
```

`components/ui/ProductDot.tsx`:
```tsx
import { type ProductId, productById } from "@/lib/products/catalog";

/** Decorative product colour dot; the product name is always shown next to it. */
export function ProductDot({ productId }: { productId: ProductId }) {
  const product = productById(productId);
  return (
    <span
      aria-hidden="true"
      className="inline-block size-1.5 shrink-0 rounded-full"
      style={{ background: `var(${product.colorVar})` }}
    />
  );
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm vitest run lib/products components/ui`
Expected: PASS (8 tests).

- [ ] **Step 7: Full gate and commit**

Run: `pnpm check` → PASS.
```bash
git add -A
git commit -m "feat: add UI primitives and product catalog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Config, database and audit log

**Files:**
- Create: `lib/config.ts`, `lib/config.test.ts`, `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `drizzle/` (generated), `lib/audit.ts`, `lib/audit.test.ts`, `tests/helpers/db.ts`

**Interfaces:**
- Produces:
  - `type Config = { NODE_ENV; HARBOUR_ALLOWED_LOGINS: string[]; HARBOUR_ORIGIN: string; HARBOUR_RP_ID: string; HARBOUR_DB_PATH: string; HARBOUR_TIMEZONE: string; HARBOUR_DEV_IDENTITY?: string }`, `parseConfig(env: Record<string, string | undefined>): Config`, `getConfig(): Config`
  - Drizzle tables `sessions`, `passkeys`, `authChallenges`, `setupTokens`, `auditLog`
  - `type Db`, `openDb(path: string): Db`, `migrateDb(db: Db): void`, `getDb(): Db`
  - `audit(db: Db, entry: { login: string | null; event: AuditEvent; detail?: Record<string, unknown> }, now?: Date): void`, `type AuditEvent = "login" | "logout" | "passkey_registered" | "passkey_removed" | "setup_token_issued" | "setup_token_rejected"`
  - `openTestDb(): Db` (tests only)

- [ ] **Step 1: Write failing test `lib/config.test.ts`**

```ts
import { parseConfig } from "./config";

const base = {
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "Owner@Example.com, other@example.com",
  HARBOUR_ORIGIN: "https://pc.tail1234.ts.net",
  HARBOUR_RP_ID: "pc.tail1234.ts.net",
};

describe("parseConfig", () => {
  it("normalises allowed logins and applies defaults", () => {
    const config = parseConfig(base);
    expect(config.HARBOUR_ALLOWED_LOGINS).toEqual(["owner@example.com", "other@example.com"]);
    expect(config.HARBOUR_DB_PATH).toBe("./data/harbour.db");
    expect(config.HARBOUR_TIMEZONE).toBe("Europe/London");
  });

  it("rejects a missing allowlist", () => {
    expect(() => parseConfig({ ...base, HARBOUR_ALLOWED_LOGINS: " , " })).toThrow();
  });

  it("refuses a dev identity in production", () => {
    expect(() => parseConfig({ ...base, HARBOUR_DEV_IDENTITY: "owner@example.com" })).toThrow(
      /HARBOUR_DEV_IDENTITY/,
    );
  });

  it("allows a dev identity in development", () => {
    const config = parseConfig({ ...base, NODE_ENV: "development", HARBOUR_DEV_IDENTITY: "x@y.z" });
    expect(config.HARBOUR_DEV_IDENTITY).toBe("x@y.z");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/config.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/config.ts`**

```ts
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HARBOUR_ALLOWED_LOGINS: z
      .string()
      .transform((raw) =>
        raw
          .split(",")
          .map((login) => login.trim().toLowerCase())
          .filter((login) => login.length > 0),
      )
      .pipe(z.array(z.string()).min(1, "HARBOUR_ALLOWED_LOGINS must list at least one login")),
    HARBOUR_ORIGIN: z.url(),
    HARBOUR_RP_ID: z.string().min(1),
    HARBOUR_DB_PATH: z.string().min(1).default("./data/harbour.db"),
    HARBOUR_TIMEZONE: z.string().min(1).default("Europe/London"),
    HARBOUR_DEV_IDENTITY: z.string().min(1).optional(),
  })
  .refine((c) => !(c.NODE_ENV === "production" && c.HARBOUR_DEV_IDENTITY), {
    message: "HARBOUR_DEV_IDENTITY must not be set in production",
    path: ["HARBOUR_DEV_IDENTITY"],
  });

export type Config = z.infer<typeof schema>;

/** Validates environment variables; throws with a readable message when invalid. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  return schema.parse(env);
}

let cached: Config | undefined;

/** Process-wide config, validated once. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run lib/config.test.ts` → PASS (4 tests).

- [ ] **Step 5: Write `lib/db/schema.ts`**

```ts
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  login: text("login").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastSeenAt: timestamp("last_seen_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(),
  login: text("login").notNull(),
  publicKey: blob("public_key", { mode: "buffer" }).notNull(),
  counter: integer("counter").notNull(),
  transports: text("transports", { mode: "json" }).$type<string[]>(),
  deviceLabel: text("device_label").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const authChallenges = sqliteTable("auth_challenges", {
  flowId: text("flow_id").primaryKey(),
  kind: text("kind", { enum: ["register", "authenticate"] }).notNull(),
  login: text("login").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const setupTokens = sqliteTable("setup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: timestamp("at").notNull(),
  login: text("login"),
  event: text("event").notNull(),
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
});
```

- [ ] **Step 6: Write `drizzle.config.ts` and generate the migration**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
```

Run: `pnpm db:generate --name init`
Expected: creates `drizzle/0000_init.sql` and `drizzle/meta/` with five `CREATE TABLE` statements.

- [ ] **Step 7: Write `lib/db/client.ts`**

```ts
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getConfig } from "@/lib/config";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** Opens a SQLite database with Harbour's pragmas. Use ":memory:" in tests. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle({ client: sqlite, schema });
}

/** Applies pending migrations from ./drizzle. Safe to run repeatedly. */
export function migrateDb(db: Db): void {
  migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
}

let instance: Db | undefined;

/** The process-wide database, migrated on first use. */
export function getDb(): Db {
  if (!instance) {
    instance = openDb(getConfig().HARBOUR_DB_PATH);
    migrateDb(instance);
  }
  return instance;
}
```

`tests/helpers/db.ts`:
```ts
import { type Db, migrateDb, openDb } from "@/lib/db/client";

/** Fresh, fully migrated in-memory database for a test. */
export function openTestDb(): Db {
  const db = openDb(":memory:");
  migrateDb(db);
  return db;
}
```

- [ ] **Step 8: Write failing test `lib/audit.test.ts`**

```ts
import { openTestDb } from "@/tests/helpers/db";
import { audit } from "./audit";
import { auditLog } from "./db/schema";

describe("audit", () => {
  it("records an event with its detail", () => {
    const db = openTestDb();
    const now = new Date("2026-10-01T06:00:00Z");
    audit(db, { login: "owner@example.com", event: "login", detail: { device: "Laptop" } }, now);
    const rows = db.select().from(auditLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      login: "owner@example.com",
      event: "login",
      detail: { device: "Laptop" },
      at: now,
    });
  });
});
```

- [ ] **Step 9: Run to verify failure** — `pnpm vitest run lib/audit.test.ts` → FAIL.

- [ ] **Step 10: Implement `lib/audit.ts`**

```ts
import type { Db } from "./db/client";
import { auditLog } from "./db/schema";

export type AuditEvent =
  | "login"
  | "logout"
  | "passkey_registered"
  | "passkey_removed"
  | "setup_token_issued"
  | "setup_token_rejected";

/** Appends a security-relevant event to the audit log. */
export function audit(
  db: Db,
  entry: { login: string | null; event: AuditEvent; detail?: Record<string, unknown> },
  now: Date = new Date(),
): void {
  db.insert(auditLog)
    .values({ at: now, login: entry.login, event: entry.event, detail: entry.detail ?? null })
    .run();
}
```

- [ ] **Step 11: Run tests, gate, commit**

Run: `pnpm vitest run lib && pnpm check` → PASS.
```bash
git add -A
git commit -m "feat: add validated config, SQLite schema and audit log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lock 1 — Tailscale identity gate, CSP and proxy

**Files:**
- Create: `lib/auth/tailscale.ts`, `lib/auth/tailscale.test.ts`, `lib/auth/paths.ts`, `lib/auth/cookies.ts`, `lib/auth/gate.ts`, `lib/auth/gate.test.ts`, `lib/security/csp.ts`, `lib/security/csp.test.ts`, `proxy.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `Config`, `getConfig()` (Task 5).
- Produces:
  - `TS_LOGIN_HEADER = "tailscale-user-login"`, `type IdentityResult = { ok: true; login: string } | { ok: false; reason: "missing" | "not-allowed" }`, `resolveIdentity(headers: Headers, config: Config): IdentityResult`
  - `isPublicPath(pathname: string): boolean`
  - `SESSION_COOKIE = "harbour_session"`, `FLOW_COOKIE = "harbour_flow"`, `sessionCookieOptions()`, `flowCookieOptions()`
  - `type GateDecision = { kind: "forbid" } | { kind: "login" } | { kind: "next"; login: string }`, `decideGate(input: { headers: Headers; pathname: string; hasSessionCookie: boolean }, config: Config): GateDecision`
  - `buildCsp(nonce: string, dev: boolean): string`

- [ ] **Step 1: Write failing tests**

`lib/auth/tailscale.test.ts`:
```ts
import { parseConfig } from "@/lib/config";
import { resolveIdentity } from "./tailscale";

const env = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail.ts.net",
  HARBOUR_RP_ID: "pc.tail.ts.net",
};
const prod = parseConfig({ ...env, NODE_ENV: "production" });
const dev = parseConfig({ ...env, NODE_ENV: "development", HARBOUR_DEV_IDENTITY: "owner@example.com" });

describe("resolveIdentity", () => {
  it("accepts an allowlisted Tailscale login, case-insensitively", () => {
    const headers = new Headers({ "Tailscale-User-Login": "Owner@Example.com" });
    expect(resolveIdentity(headers, prod)).toEqual({ ok: true, login: "owner@example.com" });
  });

  it("rejects a missing header in production", () => {
    expect(resolveIdentity(new Headers(), prod)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a login that is not allowlisted", () => {
    const headers = new Headers({ "Tailscale-User-Login": "intruder@example.com" });
    expect(resolveIdentity(headers, prod)).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("uses the dev identity only when no header is present outside production", () => {
    expect(resolveIdentity(new Headers(), dev)).toEqual({ ok: true, login: "owner@example.com" });
    const spoof = new Headers({ "Tailscale-User-Login": "intruder@example.com" });
    expect(resolveIdentity(spoof, dev)).toEqual({ ok: false, reason: "not-allowed" });
  });
});
```

`lib/auth/gate.test.ts`:
```ts
import { parseConfig } from "@/lib/config";
import { decideGate } from "./gate";

const config = parseConfig({
  NODE_ENV: "production",
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://pc.tail.ts.net",
  HARBOUR_RP_ID: "pc.tail.ts.net",
});
const me = new Headers({ "Tailscale-User-Login": "owner@example.com" });

describe("decideGate", () => {
  it("forbids every path, public or not, without a valid identity", () => {
    for (const pathname of ["/", "/login", "/api/auth/login/options"]) {
      expect(decideGate({ headers: new Headers(), pathname, hasSessionCookie: true }, config)).toEqual({
        kind: "forbid",
      });
    }
  });

  it("sends identified visitors without a session cookie to login", () => {
    expect(decideGate({ headers: me, pathname: "/", hasSessionCookie: false }, config)).toEqual({
      kind: "login",
    });
  });

  it("lets identified visitors reach public auth paths without a session", () => {
    for (const pathname of ["/login", "/setup", "/api/auth/login/options"]) {
      expect(decideGate({ headers: me, pathname, hasSessionCookie: false }, config).kind).toBe("next");
    }
  });

  it("does not treat look-alike paths as public", () => {
    expect(decideGate({ headers: me, pathname: "/loginx", hasSessionCookie: false }, config).kind).toBe(
      "login",
    );
  });

  it("passes identified visitors with a session cookie", () => {
    expect(decideGate({ headers: me, pathname: "/design", hasSessionCookie: true }, config)).toEqual({
      kind: "next",
      login: "owner@example.com",
    });
  });
});
```

`lib/security/csp.test.ts`:
```ts
import { buildCsp } from "./csp";

describe("buildCsp", () => {
  it("locks scripts to the nonce in production", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval and websockets only in development", () => {
    const csp = buildCsp("abc123", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/auth lib/security` → FAIL.

- [ ] **Step 3: Implement `lib/auth/tailscale.ts`**

```ts
import type { Config } from "@/lib/config";

/** Header Tailscale Serve adds with the visitor's verified login (it strips client-sent copies). */
export const TS_LOGIN_HEADER = "tailscale-user-login";

export type IdentityResult =
  | { ok: true; login: string }
  | { ok: false; reason: "missing" | "not-allowed" };

/** Lock 1: who is this, according to Tailscale, and are they allowed in? */
export function resolveIdentity(headers: Headers, config: Config): IdentityResult {
  const header = headers.get(TS_LOGIN_HEADER)?.trim().toLowerCase();
  const devIdentity =
    config.NODE_ENV !== "production" ? config.HARBOUR_DEV_IDENTITY?.trim().toLowerCase() : undefined;
  const login = header || devIdentity;
  if (!login) return { ok: false, reason: "missing" };
  if (!config.HARBOUR_ALLOWED_LOGINS.includes(login)) return { ok: false, reason: "not-allowed" };
  return { ok: true, login };
}
```

- [ ] **Step 4: Implement `lib/auth/paths.ts` and `lib/auth/cookies.ts`**

`lib/auth/paths.ts`:
```ts
// Reachable with a Tailscale identity but before a passkey session exists.
const PUBLIC_EXACT = ["/login", "/setup"];
const PUBLIC_PREFIXES = ["/api/auth/"];

/** True for pages and endpoints used to obtain a session. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
```

`lib/auth/cookies.ts`:
```ts
export const SESSION_COOKIE = "harbour_session";
export const FLOW_COOKIE = "harbour_flow";

// The database is authoritative for expiry; the cookie just lives as long as browsers allow.
const BROWSER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Session cookie attributes (spec §10). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: BROWSER_MAX_AGE_SECONDS,
  };
}

/** Short-lived cookie that links a WebAuthn ceremony's two requests. */
export function flowCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/api/auth", maxAge: 300 };
}
```

- [ ] **Step 5: Implement `lib/auth/gate.ts`**

```ts
import type { Config } from "@/lib/config";
import { isPublicPath } from "./paths";
import { resolveIdentity } from "./tailscale";

export type GateDecision = { kind: "forbid" } | { kind: "login" } | { kind: "next"; login: string };

/**
 * Edge decision for every request. Lock 1 is enforced here for all paths; Lock 2
 * (session validity) is checked in server code because it needs the database.
 */
export function decideGate(
  input: { headers: Headers; pathname: string; hasSessionCookie: boolean },
  config: Config,
): GateDecision {
  const identity = resolveIdentity(input.headers, config);
  if (!identity.ok) return { kind: "forbid" };
  if (!input.hasSessionCookie && !isPublicPath(input.pathname)) return { kind: "login" };
  return { kind: "next", login: identity.login };
}
```

- [ ] **Step 6: Implement `lib/security/csp.ts`**

```ts
/** Content-Security-Policy for a single response, keyed to its script nonce. */
export function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
```

- [ ] **Step 7: Run to verify pass** — `pnpm vitest run lib/auth lib/security` → PASS (11 tests).

- [ ] **Step 8: Write `proxy.ts`**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { decideGate } from "@/lib/auth/gate";
import { getConfig } from "@/lib/config";
import { buildCsp } from "@/lib/security/csp";

export function proxy(request: NextRequest) {
  const settings = getConfig();
  const decision = decideGate(
    {
      headers: request.headers,
      pathname: request.nextUrl.pathname,
      hasSessionCookie: request.cookies.has(SESSION_COOKIE),
    },
    settings,
  );
  if (decision.kind === "forbid") return new NextResponse("Forbidden", { status: 403 });
  if (decision.kind === "login") {
    return NextResponse.redirect(new URL("/login", settings.HARBOUR_ORIGIN));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, settings.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 9: Add static security headers in `next.config.ts`**

```ts
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

- [ ] **Step 10: Manual check of Lock 1**

Run: `cp .env.example .env` then edit `.env` setting `HARBOUR_ALLOWED_LOGINS=dev@example.com`, `HARBOUR_ORIGIN=http://localhost:3400`, `HARBOUR_RP_ID=localhost`. Then `pnpm build && pnpm start` in one terminal and in another:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3400/
curl -s -o /dev/null -w "%{http_code}\n" -H "Tailscale-User-Login: dev@example.com" http://127.0.0.1:3400/
```
Expected: `403`, then `307` (redirect to /login). Stop the server.

- [ ] **Step 11: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add -A
git commit -m "feat: enforce Tailscale identity and nonce CSP in proxy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sessions, challenges and setup tokens

**Files:**
- Create: `lib/auth/sessions.ts`, `lib/auth/sessions.test.ts`, `lib/auth/challenges.ts`, `lib/auth/challenges.test.ts`, `lib/auth/setup-tokens.ts`, `lib/auth/setup-tokens.test.ts`, `lib/auth/token.ts`

**Interfaces:**
- Consumes: `Db`, tables (Task 5); `openTestDb()`.
- Produces:
  - `randomToken(): string` (32 bytes base64url), `hashToken(token: string): string` (sha256 hex)
  - `SESSION_TTL_MS`, `createSession(db, login, now?): { token: string; expiresAt: Date }`, `validateSession(db, token, login, now?): { login: string; expiresAt: Date } | null`, `revokeSession(db, token): void`
  - `CHALLENGE_TTL_MS`, `saveChallenge(db, { kind, login, challenge }, now?): string /* flowId */`, `consumeChallenge(db, { flowId, kind, login }, now?): string | null`
  - `SETUP_TOKEN_TTL_MS`, `issueSetupToken(db, now?): { token: string; expiresAt: Date }`, `consumeSetupToken(db, token, now?): boolean`

- [ ] **Step 1: Write failing tests**

`lib/auth/sessions.test.ts`:
```ts
import { openTestDb } from "@/tests/helpers/db";
import { sessions } from "@/lib/db/schema";
import { createSession, revokeSession, SESSION_TTL_MS, validateSession } from "./sessions";

const t0 = new Date("2026-10-01T00:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

describe("sessions", () => {
  it("stores only a hash of the token", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", t0);
    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(token);
  });

  it("validates a fresh session for the same login", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", t0);
    expect(validateSession(db, token, "owner@example.com", later(1000))?.login).toBe("owner@example.com");
  });

  it("rejects a session presented under a different Tailscale login", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", t0);
    expect(validateSession(db, token, "other@example.com", later(1000))).toBeNull();
  });

  it("rejects unknown and expired tokens", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", t0);
    expect(validateSession(db, "nope", "owner@example.com", t0)).toBeNull();
    expect(validateSession(db, token, "owner@example.com", later(SESSION_TTL_MS + 1))).toBeNull();
  });

  it("slides expiry forward when used after a day", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", t0);
    const result = validateSession(db, token, "owner@example.com", later(2 * DAY));
    expect(result?.expiresAt.getTime()).toBe(later(2 * DAY + SESSION_TTL_MS).getTime());
    expect(validateSession(db, token, "owner@example.com", later(SESSION_TTL_MS + DAY))).not.toBeNull();
  });

  it("revokes a session", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", t0);
    revokeSession(db, token);
    expect(validateSession(db, token, "owner@example.com", t0)).toBeNull();
  });
});
```

`lib/auth/challenges.test.ts`:
```ts
import { openTestDb } from "@/tests/helpers/db";
import { CHALLENGE_TTL_MS, consumeChallenge, saveChallenge } from "./challenges";

const t0 = new Date("2026-10-01T00:00:00Z");
const login = "owner@example.com";

describe("challenges", () => {
  it("returns the challenge once, then never again", () => {
    const db = openTestDb();
    const flowId = saveChallenge(db, { kind: "authenticate", login, challenge: "c1" }, t0);
    expect(consumeChallenge(db, { flowId, kind: "authenticate", login }, t0)).toBe("c1");
    expect(consumeChallenge(db, { flowId, kind: "authenticate", login }, t0)).toBeNull();
  });

  it("rejects the wrong ceremony kind or login", () => {
    const db = openTestDb();
    const flowId = saveChallenge(db, { kind: "register", login, challenge: "c1" }, t0);
    expect(consumeChallenge(db, { flowId, kind: "authenticate", login }, t0)).toBeNull();
    const flow2 = saveChallenge(db, { kind: "register", login, challenge: "c2" }, t0);
    expect(consumeChallenge(db, { flowId: flow2, kind: "register", login: "x@y.z" }, t0)).toBeNull();
  });

  it("rejects expired challenges", () => {
    const db = openTestDb();
    const flowId = saveChallenge(db, { kind: "register", login, challenge: "c1" }, t0);
    const late = new Date(t0.getTime() + CHALLENGE_TTL_MS + 1);
    expect(consumeChallenge(db, { flowId, kind: "register", login }, late)).toBeNull();
  });
});
```

`lib/auth/setup-tokens.test.ts`:
```ts
import { openTestDb } from "@/tests/helpers/db";
import { consumeSetupToken, issueSetupToken, SETUP_TOKEN_TTL_MS } from "./setup-tokens";

const t0 = new Date("2026-10-01T00:00:00Z");

describe("setup tokens", () => {
  it("can be used exactly once", () => {
    const db = openTestDb();
    const { token } = issueSetupToken(db, t0);
    expect(consumeSetupToken(db, token, t0)).toBe(true);
    expect(consumeSetupToken(db, token, t0)).toBe(false);
  });

  it("expire after the TTL", () => {
    const db = openTestDb();
    const { token } = issueSetupToken(db, t0);
    expect(consumeSetupToken(db, token, new Date(t0.getTime() + SETUP_TOKEN_TTL_MS + 1))).toBe(false);
  });

  it("rejects unknown tokens", () => {
    expect(consumeSetupToken(openTestDb(), "made-up", t0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/auth` → new suites FAIL.

- [ ] **Step 3: Implement `lib/auth/token.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way hash used to store tokens at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Implement `lib/auth/sessions.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { hashToken, randomToken } from "./token";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Avoid a write on every request: extend expiry at most once a day.
const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Starts a session for a login and returns the raw token for the cookie. */
export function createSession(db: Db, login: string, now: Date = new Date()) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({ tokenHash: hashToken(token), login, createdAt: now, lastSeenAt: now, expiresAt })
    .run();
  return { token, expiresAt };
}

/** Lock 2: returns the session if the token is valid for this Tailscale login. */
export function validateSession(db: Db, token: string, login: string, now: Date = new Date()) {
  const tokenHash = hashToken(token);
  const row = db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).get();
  if (!row || row.login !== login || row.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - row.lastSeenAt.getTime() < SLIDE_AFTER_MS) {
    return { login: row.login, expiresAt: row.expiresAt };
  }
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.tokenHash, tokenHash)).run();
  return { login: row.login, expiresAt };
}

/** Ends a session (logout). */
export function revokeSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
}
```

- [ ] **Step 5: Implement `lib/auth/challenges.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { authChallenges } from "@/lib/db/schema";
import { randomToken } from "./token";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type Kind = "register" | "authenticate";

/** Stores a WebAuthn challenge and returns the flow id that links the ceremony's two requests. */
export function saveChallenge(
  db: Db,
  input: { kind: Kind; login: string; challenge: string },
  now: Date = new Date(),
): string {
  const flowId = randomToken();
  db.insert(authChallenges)
    .values({ flowId, ...input, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) })
    .run();
  return flowId;
}

/** Returns the challenge for a flow exactly once; null if missing, mismatched or expired. */
export function consumeChallenge(
  db: Db,
  input: { flowId: string; kind: Kind; login: string },
  now: Date = new Date(),
): string | null {
  const row = db
    .delete(authChallenges)
    .where(and(eq(authChallenges.flowId, input.flowId), eq(authChallenges.kind, input.kind)))
    .returning()
    .get();
  if (!row || row.login !== input.login || row.expiresAt.getTime() <= now.getTime()) return null;
  return row.challenge;
}
```

- [ ] **Step 6: Implement `lib/auth/setup-tokens.ts`**

```ts
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { setupTokens } from "@/lib/db/schema";
import { hashToken, randomToken } from "./token";

export const SETUP_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Issues a single-use token that authorises registering one passkey. */
export function issueSetupToken(db: Db, now: Date = new Date()) {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_MS);
  db.insert(setupTokens).values({ tokenHash: hashToken(token), createdAt: now, expiresAt }).run();
  return { token, expiresAt };
}

/** Marks a setup token used. True only for an unused, unexpired token. */
export function consumeSetupToken(db: Db, token: string, now: Date = new Date()): boolean {
  const updated = db
    .update(setupTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(setupTokens.tokenHash, hashToken(token)),
        isNull(setupTokens.usedAt),
        gt(setupTokens.expiresAt, now),
      ),
    )
    .returning()
    .all();
  return updated.length === 1;
}
```

- [ ] **Step 7: Run to verify pass** — `pnpm vitest run lib/auth` → PASS (all auth suites).

- [ ] **Step 8: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add -A
git commit -m "feat: add hashed sessions, single-use challenges and setup tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Passkey ceremonies and auth API routes

**Files:**
- Create: `lib/auth/passkeys.ts`, `lib/auth/passkeys.test.ts`, `lib/auth/relying-party.ts`, `lib/auth/request.ts`, `lib/http/responses.ts`, `lib/http/same-origin.ts`, `lib/http/same-origin.test.ts`, `app/api/auth/register/options/route.ts`, `app/api/auth/register/verify/route.ts`, `app/api/auth/login/options/route.ts`, `app/api/auth/login/verify/route.ts`, `app/api/auth/logout/route.ts`

**Interfaces:**
- Consumes: Tasks 5–7 (`Db`, `getDb`, `getConfig`, `resolveIdentity`, cookies, sessions, challenges, setup tokens, `audit`).
- Produces:
  - `type RelyingParty = { id: string; name: string; origin: string }`, `relyingParty(config: Config): RelyingParty`
  - `beginRegistration(db, rp, login, now?): Promise<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }>`
  - `finishRegistration(db, rp, input: { flowId; login; response: RegistrationResponseJSON; deviceLabel }, now?): Promise<CeremonyResult>`
  - `beginAuthentication(db, rp, login, now?): Promise<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON } | null /* null = no passkeys */>`
  - `finishAuthentication(db, rp, input: { flowId; login; response: AuthenticationResponseJSON }, now?): Promise<CeremonyResult>`
  - `type CeremonyResult = { ok: true; deviceLabel: string } | { ok: false; reason: "expired_challenge" | "unknown_credential" | "verification_failed" }`
  - `jsonError(status: number, code: string): Response`
  - `rejectCrossSite(request: Request, origin: string): Response | null`
  - `requestLogin(request: Request): string | null` (Tailscale identity for route handlers)

- [ ] **Step 1: Write failing test `lib/http/same-origin.test.ts`**

```ts
import { rejectCrossSite } from "./same-origin";

const origin = "https://pc.tail.ts.net";
const req = (headers: Record<string, string>) =>
  new Request(`${origin}/api/x`, { method: "POST", headers });

describe("rejectCrossSite", () => {
  it("allows same-origin JSON requests", () => {
    expect(rejectCrossSite(req({ origin, "content-type": "application/json" }), origin)).toBeNull();
  });

  it("rejects other origins and missing origin", async () => {
    const evil = rejectCrossSite(req({ origin: "https://evil.example", "content-type": "application/json" }), origin);
    expect(evil?.status).toBe(403);
    expect(rejectCrossSite(req({ "content-type": "application/json" }), origin)?.status).toBe(403);
  });

  it("rejects non-JSON bodies (form posts cannot be forged cross-site as JSON)", () => {
    const form = rejectCrossSite(req({ origin, "content-type": "application/x-www-form-urlencoded" }), origin);
    expect(form?.status).toBe(415);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/http` → FAIL.

- [ ] **Step 3: Implement `lib/http/responses.ts` and `lib/http/same-origin.ts`**

`lib/http/responses.ts`:
```ts
/** Consistent JSON error body: `{ error: code }`. */
export function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}
```

`lib/http/same-origin.ts`:
```ts
import { jsonError } from "./responses";

/** CSRF guard for mutating routes: same origin and JSON only. Returns a response to send, or null. */
export function rejectCrossSite(request: Request, origin: string): Response | null {
  if (request.headers.get("origin") !== origin) return jsonError(403, "bad_origin");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) return jsonError(415, "json_required");
  return null;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run lib/http` → PASS.

- [ ] **Step 5: Write failing test `lib/auth/passkeys.test.ts`**

```ts
import { eq } from "drizzle-orm";
import { openTestDb } from "@/tests/helpers/db";
import { passkeys } from "@/lib/db/schema";
import {
  beginAuthentication,
  beginRegistration,
  finishAuthentication,
  finishRegistration,
} from "./passkeys";

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: "reg-challenge" })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: "auth-challenge" })),
  verifyRegistrationResponse: vi.fn(async () => ({
    verified: true,
    registrationInfo: {
      credential: { id: "cred-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] },
    },
  })),
  verifyAuthenticationResponse: vi.fn(async () => ({
    verified: true,
    authenticationInfo: { newCounter: 7 },
  })),
}));

const server = await import("@simplewebauthn/server");
const rp = { id: "pc.tail.ts.net", name: "Harbour", origin: "https://pc.tail.ts.net" };
const login = "owner@example.com";
const t0 = new Date("2026-10-01T00:00:00Z");
// Shapes are irrelevant here: the library is mocked; we test Harbour's handling around it.
const regResponse = { id: "cred-1" } as never;
const authResponse = { id: "cred-1" } as never;

async function registered() {
  const db = openTestDb();
  const { flowId } = await beginRegistration(db, rp, login, t0);
  await finishRegistration(db, rp, { flowId, login, response: regResponse, deviceLabel: "Laptop" }, t0);
  return db;
}

describe("passkey registration", () => {
  it("stores the verified credential against the login", async () => {
    const db = await registered();
    const row = db.select().from(passkeys).where(eq(passkeys.id, "cred-1")).get();
    expect(row).toMatchObject({ login, deviceLabel: "Laptop", counter: 0, transports: ["internal"] });
  });

  it("fails with an unknown or reused flow", async () => {
    const db = openTestDb();
    const result = await finishRegistration(db, rp, { flowId: "nope", login, response: regResponse, deviceLabel: "X" }, t0);
    expect(result).toEqual({ ok: false, reason: "expired_challenge" });
  });

  it("reports a library verification error instead of throwing", async () => {
    vi.mocked(server.verifyRegistrationResponse).mockRejectedValueOnce(new Error("bad attestation"));
    const db = openTestDb();
    const { flowId } = await beginRegistration(db, rp, login, t0);
    const result = await finishRegistration(db, rp, { flowId, login, response: regResponse, deviceLabel: "X" }, t0);
    expect(result).toEqual({ ok: false, reason: "verification_failed" });
    expect(db.select().from(passkeys).all()).toHaveLength(0);
  });
});

describe("passkey authentication", () => {
  it("returns null when the login has no passkeys", async () => {
    expect(await beginAuthentication(openTestDb(), rp, login, t0)).toBeNull();
  });

  it("verifies against the stored credential and updates the counter", async () => {
    const db = await registered();
    const begun = await beginAuthentication(db, rp, login, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(db, rp, { flowId: begun.flowId, login, response: authResponse }, t0);
    expect(result).toEqual({ ok: true, deviceLabel: "Laptop" });
    const row = db.select().from(passkeys).where(eq(passkeys.id, "cred-1")).get();
    expect(row?.counter).toBe(7);
    expect(row?.lastUsedAt).toEqual(t0);
    expect(vi.mocked(server.verifyAuthenticationResponse)).toHaveBeenCalledWith(
      expect.objectContaining({ expectedChallenge: "auth-challenge", expectedOrigin: rp.origin, expectedRPID: rp.id }),
    );
  });

  it("rejects a credential that belongs to nobody", async () => {
    const db = await registered();
    const begun = await beginAuthentication(db, rp, login, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(
      db, rp, { flowId: begun.flowId, login, response: { id: "someone-else" } as never }, t0,
    );
    expect(result).toEqual({ ok: false, reason: "unknown_credential" });
  });

  it("rejects an unverified assertion", async () => {
    vi.mocked(server.verifyAuthenticationResponse).mockResolvedValueOnce({ verified: false } as never);
    const db = await registered();
    const begun = await beginAuthentication(db, rp, login, t0);
    if (!begun) throw new Error("expected options");
    const result = await finishAuthentication(db, rp, { flowId: begun.flowId, login, response: authResponse }, t0);
    expect(result).toEqual({ ok: false, reason: "verification_failed" });
  });
});
```

- [ ] **Step 6: Run to verify failure** — `pnpm vitest run lib/auth/passkeys.test.ts` → FAIL.

- [ ] **Step 7: Implement `lib/auth/relying-party.ts` and `lib/auth/passkeys.ts`**

`lib/auth/relying-party.ts`:
```ts
import type { Config } from "@/lib/config";

export type RelyingParty = { id: string; name: string; origin: string };

/** WebAuthn relying party derived from config. */
export function relyingParty(config: Config): RelyingParty {
  return { id: config.HARBOUR_RP_ID, name: "Harbour", origin: config.HARBOUR_ORIGIN };
}
```

`lib/auth/passkeys.ts`:
```ts
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { passkeys } from "@/lib/db/schema";
import { consumeChallenge, saveChallenge } from "./challenges";
import type { RelyingParty } from "./relying-party";

export type CeremonyResult =
  | { ok: true; deviceLabel: string }
  | { ok: false; reason: "expired_challenge" | "unknown_credential" | "verification_failed" };

const asTransports = (t: string[] | null) => (t ?? undefined) as AuthenticatorTransportFuture[] | undefined;

function credentialsFor(db: Db, login: string) {
  return db.select().from(passkeys).where(eq(passkeys.login, login)).all();
}

/** Starts registering a new passkey. Callers must have consumed a setup token first. */
export async function beginRegistration(db: Db, rp: RelyingParty, login: string, now = new Date()) {
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: login,
    attestationType: "none",
    excludeCredentials: credentialsFor(db, login).map((c) => ({ id: c.id, transports: asTransports(c.transports) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  const flowId = saveChallenge(db, { kind: "register", login, challenge: options.challenge }, now);
  return { flowId, options };
}

/** Verifies the browser's registration response and stores the credential. */
export async function finishRegistration(
  db: Db,
  rp: RelyingParty,
  input: { flowId: string; login: string; response: RegistrationResponseJSON; deviceLabel: string },
  now = new Date(),
): Promise<CeremonyResult> {
  const challenge = consumeChallenge(db, { flowId: input.flowId, kind: "register", login: input.login }, now);
  if (!challenge) return { ok: false, reason: "expired_challenge" };
  try {
    const result = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
    if (!result.verified) return { ok: false, reason: "verification_failed" };
    const { credential } = result.registrationInfo;
    db.insert(passkeys)
      .values({
        id: credential.id,
        login: input.login,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceLabel: input.deviceLabel,
        createdAt: now,
        lastUsedAt: null,
      })
      .run();
    return { ok: true, deviceLabel: input.deviceLabel };
  } catch (error) {
    console.error("passkey registration failed", error);
    return { ok: false, reason: "verification_failed" };
  }
}

/** Starts a sign-in ceremony; null when the login has no passkeys yet. */
export async function beginAuthentication(db: Db, rp: RelyingParty, login: string, now = new Date()) {
  const credentials = credentialsFor(db, login);
  if (credentials.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({ id: c.id, transports: asTransports(c.transports) })),
  });
  const flowId = saveChallenge(db, { kind: "authenticate", login, challenge: options.challenge }, now);
  return { flowId, options };
}

/** Verifies a sign-in assertion and advances the credential's signature counter. */
export async function finishAuthentication(
  db: Db,
  rp: RelyingParty,
  input: { flowId: string; login: string; response: AuthenticationResponseJSON },
  now = new Date(),
): Promise<CeremonyResult> {
  const challenge = consumeChallenge(db, { flowId: input.flowId, kind: "authenticate", login: input.login }, now);
  if (!challenge) return { ok: false, reason: "expired_challenge" };
  const where = and(eq(passkeys.id, input.response.id), eq(passkeys.login, input.login));
  const stored = db.select().from(passkeys).where(where).get();
  if (!stored) return { ok: false, reason: "unknown_credential" };
  try {
    const result = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: asTransports(stored.transports),
      },
    });
    if (!result.verified) return { ok: false, reason: "verification_failed" };
    db.update(passkeys)
      .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: now })
      .where(where)
      .run();
    return { ok: true, deviceLabel: stored.deviceLabel };
  } catch (error) {
    console.error("passkey authentication failed", error);
    return { ok: false, reason: "verification_failed" };
  }
}
```

- [ ] **Step 8: Run to verify pass** — `pnpm vitest run lib/auth` → PASS.

- [ ] **Step 9: Implement `lib/auth/request.ts`**

```ts
import { getConfig } from "@/lib/config";
import { resolveIdentity } from "./tailscale";

/** Tailscale login for a route handler request (defence in depth behind the proxy). */
export function requestLogin(request: Request): string | null {
  const identity = resolveIdentity(request.headers, getConfig());
  return identity.ok ? identity.login : null;
}
```

- [ ] **Step 10: Write the route handlers**

`app/api/auth/register/options/route.ts`:
```ts
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { FLOW_COOKIE, flowCookieOptions } from "@/lib/auth/cookies";
import { beginRegistration } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { consumeSetupToken } from "@/lib/auth/setup-tokens";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({ setupToken: z.string().min(1) });

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  if (!consumeSetupToken(db, body.data.setupToken)) {
    audit(db, { login, event: "setup_token_rejected" });
    return jsonError(401, "invalid_setup_token");
  }
  const { flowId, options } = await beginRegistration(db, relyingParty(config), login);
  (await cookies()).set(FLOW_COOKIE, flowId, flowCookieOptions());
  return Response.json(options);
}
```

`app/api/auth/register/verify/route.ts`:
```ts
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { FLOW_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { finishRegistration } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({
  deviceLabel: z.string().trim().min(1).max(60),
  response: z.looseObject({ id: z.string().min(1) }),
});

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const jar = await cookies();
  const flowId = jar.get(FLOW_COOKIE)?.value;
  jar.delete(FLOW_COOKIE);
  if (!flowId) return jsonError(400, "expired_challenge");

  const db = getDb();
  const result = await finishRegistration(db, relyingParty(config), {
    flowId,
    login,
    response: body.data.response as unknown as RegistrationResponseJSON,
    deviceLabel: body.data.deviceLabel,
  });
  if (!result.ok) return jsonError(400, result.reason);

  audit(db, { login, event: "passkey_registered", detail: { device: result.deviceLabel } });
  const session = createSession(db, login);
  jar.set(SESSION_COOKIE, session.token, sessionCookieOptions());
  return Response.json({ ok: true });
}
```

`app/api/auth/login/options/route.ts`:
```ts
import { cookies } from "next/headers";
import { FLOW_COOKIE, flowCookieOptions } from "@/lib/auth/cookies";
import { beginAuthentication } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");

  const begun = await beginAuthentication(getDb(), relyingParty(config), login);
  if (!begun) return jsonError(404, "no_passkeys");
  (await cookies()).set(FLOW_COOKIE, begun.flowId, flowCookieOptions());
  return Response.json(begun.options);
}
```

`app/api/auth/login/verify/route.ts`:
```ts
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { FLOW_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookies";
import { finishAuthentication } from "@/lib/auth/passkeys";
import { relyingParty } from "@/lib/auth/relying-party";
import { requestLogin } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({ response: z.looseObject({ id: z.string().min(1) }) });

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const login = requestLogin(request);
  if (!login) return jsonError(403, "forbidden");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const jar = await cookies();
  const flowId = jar.get(FLOW_COOKIE)?.value;
  jar.delete(FLOW_COOKIE);
  if (!flowId) return jsonError(400, "expired_challenge");

  const db = getDb();
  const result = await finishAuthentication(db, relyingParty(config), {
    flowId,
    login,
    response: body.data.response as unknown as AuthenticationResponseJSON,
  });
  if (!result.ok) return jsonError(401, result.reason);

  audit(db, { login, event: "login", detail: { device: result.deviceLabel } });
  const session = createSession(db, login);
  jar.set(SESSION_COOKIE, session.token, sessionCookieOptions());
  return Response.json({ ok: true });
}
```

`app/api/auth/logout/route.ts`:
```ts
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { requestLogin } from "@/lib/auth/request";
import { revokeSession } from "@/lib/auth/sessions";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = getDb();
    revokeSession(db, token);
    audit(db, { login: requestLogin(request), event: "logout" });
  }
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
```

- [ ] **Step 11: Gate and commit**

Run: `pnpm check && pnpm build` → PASS; build lists the five `/api/auth/*` routes.
```bash
git add -A
git commit -m "feat: add passkey registration and sign-in ceremonies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Session guard, login and setup pages

**Files:**
- Create: `lib/auth/guard.ts`, `lib/auth/client-api.ts`, `components/auth/PasskeyLogin.tsx`, `components/auth/PasskeySetup.tsx`, `components/auth/AuthCard.tsx`, `app/login/page.tsx`, `app/setup/page.tsx`, `scripts/setup-token.ts`
- Delete: `app/page.tsx` (replaced by `app/(app)/page.tsx` in Task 10 — delete it in Task 10, not here)

**Interfaces:**
- Consumes: Tasks 5–8.
- Produces:
  - `getSession(): Promise<{ login: string; expiresAt: Date } | null>`, `requireSession(): Promise<{ login: string; expiresAt: Date }>` (redirects to `/login`)
  - `postJson<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }>`
  - CLI `pnpm setup-token` printing `${HARBOUR_ORIGIN}/setup?token=…`

- [ ] **Step 1: Implement `lib/auth/guard.ts`**

```ts
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { SESSION_COOKIE } from "./cookies";
import { validateSession } from "./sessions";
import { resolveIdentity } from "./tailscale";

/** Both locks: a Tailscale identity and a valid passkey session bound to it. */
export async function getSession() {
  const identity = resolveIdentity(await headers(), getConfig());
  if (!identity.ok) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(getDb(), token, identity.login);
}

/** For pages and handlers that need a signed-in user. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
```

- [ ] **Step 2: Implement `lib/auth/client-api.ts`**

```ts
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Same-origin JSON POST used by client components. Never throws. */
export async function postJson<T>(url: string, body: unknown = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: data.error ?? `http_${response.status}` };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
```

- [ ] **Step 3: Implement the auth components**

`components/auth/AuthCard.tsx`:
```tsx
import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";

/** Centred card used by the login and setup pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Panel className="w-full max-w-sm p-8">
        <p className="font-serif text-lg">Harbour</p>
        <h1 className="mt-6 font-serif text-2xl">{title}</h1>
        <div className="mt-6">{children}</div>
      </Panel>
    </main>
  );
}
```

`components/auth/PasskeyLogin.tsx`:
```tsx
"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

const MESSAGES: Record<string, string> = {
  no_passkeys: "No passkey yet. Run `pnpm setup-token` on the Harbour PC to get a setup link.",
  network_error: "Couldn't reach Harbour. Check Tailscale is connected.",
};

/** Sign-in button: runs the WebAuthn assertion ceremony. */
export function PasskeyLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const options = await postJson<PublicKeyCredentialRequestOptionsJSON>("/api/auth/login/options");
    if (!options.ok) return fail(options.error);
    try {
      const response = await startAuthentication({ optionsJSON: options.data });
      const verified = await postJson("/api/auth/login/verify", { response });
      if (!verified.ok) return fail(verified.error);
      router.replace("/");
    } catch {
      fail("cancelled");
    }
  }

  function fail(code: string) {
    setBusy(false);
    setError(MESSAGES[code] ?? "Sign-in didn't complete. Try again.");
  }

  return (
    <div className="space-y-4">
      <Button onClick={signIn} disabled={busy} className="w-full justify-center">
        {busy ? "Waiting for passkey…" : "Sign in with passkey"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
```

`components/auth/PasskeySetup.tsx`:
```tsx
"use client";

import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

const MESSAGES: Record<string, string> = {
  invalid_setup_token: "This setup link has expired or was already used. Create a new one.",
  network_error: "Couldn't reach Harbour. Check Tailscale is connected.",
};

/** Registers this device's passkey using a one-time setup token. */
export function PasskeySetup({ setupToken }: { setupToken: string }) {
  const router = useRouter();
  const labelId = useId();
  const [deviceLabel, setDeviceLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
      "/api/auth/register/options",
      { setupToken },
    );
    if (!options.ok) return fail(options.error);
    try {
      const response = await startRegistration({ optionsJSON: options.data });
      const verified = await postJson("/api/auth/register/verify", { response, deviceLabel });
      if (!verified.ok) return fail(verified.error);
      router.replace("/");
    } catch {
      fail("cancelled");
    }
  }

  function fail(code: string) {
    setBusy(false);
    setError(MESSAGES[code] ?? "Passkey setup didn't complete. Create a new setup link and retry.");
  }

  return (
    <form onSubmit={register} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={labelId} className="text-sm text-ink-muted">
          Name this device
        </label>
        <input
          id={labelId}
          required
          maxLength={60}
          value={deviceLabel}
          onChange={(e) => setDeviceLabel(e.target.value)}
          placeholder="e.g. MacBook, Pixel"
          className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full justify-center">
        {busy ? "Waiting for passkey…" : "Create passkey"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
```

Note: a setup token is consumed when options are requested, so a cancelled ceremony needs a new link — the error message says so.

- [ ] **Step 4: Write the pages**

`app/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasskeyLogin } from "@/components/auth/PasskeyLogin";
import { getSession } from "@/lib/auth/guard";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <AuthCard title="Welcome back">
      <PasskeyLogin />
    </AuthCard>
  );
}
```

`app/setup/page.tsx`:
```tsx
import { AuthCard } from "@/components/auth/AuthCard";
import { PasskeySetup } from "@/components/auth/PasskeySetup";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Set up this device">
      {token ? (
        <PasskeySetup setupToken={token} />
      ) : (
        <p className="text-sm text-ink-muted">
          Open the setup link from <code className="font-mono">pnpm setup-token</code> or from
          Settings → Devices on a signed-in device.
        </p>
      )}
    </AuthCard>
  );
}
```

- [ ] **Step 5: Write `scripts/setup-token.ts`**

```ts
import { audit } from "@/lib/audit";
import { issueSetupToken } from "@/lib/auth/setup-tokens";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";

// Prints a one-time link that registers a passkey. Run on the Harbour PC only.
const db = getDb();
const { token, expiresAt } = issueSetupToken(db);
audit(db, { login: null, event: "setup_token_issued", detail: { via: "cli" } });
const url = new URL("/setup", getConfig().HARBOUR_ORIGIN);
url.searchParams.set("token", token);
console.log(`\nOpen this link on the device to register (expires ${expiresAt.toLocaleTimeString("en-US")}):\n\n  ${url}\n`);
```

Note: `@/` imports resolve in `tsx` via `tsconfig.json` paths.

- [ ] **Step 6: Manual check of the full auth flow (dev)**

Keep `.env` from Task 6 and create `.env.development.local` (loaded only by `next dev`, gitignored) containing `HARBOUR_DEV_IDENTITY=dev@example.com`. Never put it in `.env`: production config refuses to start with it set.
```bash
pnpm setup-token
pnpm dev
```
Open the printed `http://localhost:3400/setup?token=…` in Chrome, name the device, create the passkey (Chrome on Linux offers a Google Password Manager / security-key passkey; Chrome DevTools → More tools → WebAuthn can add a virtual authenticator). Expected: redirected to `/` (still the temporary page). Visit `/login`, sign in. Expected: redirected to `/`.

- [ ] **Step 7: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add -A
git commit -m "feat: add login and device setup pages with session guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: App shell, Today page and theme toggle

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `components/shell/Sidebar.tsx`, `components/shell/NavLink.tsx`, `components/shell/nav-items.ts`, `components/shell/ThemeToggle.tsx`, `components/shell/LogoutButton.tsx`, `components/today/TodayHeader.tsx`, `components/today/ScoreTable.tsx`, `components/today/ActionCard.tsx`, `components/today/SampleBanner.tsx`, `lib/today/sample.ts`, `lib/today/sample.test.ts`, `lib/format/date.ts`, `lib/format/date.test.ts`, `components/today/ScoreTable.test.tsx`
- Delete: `app/page.tsx`

**Interfaces:**
- Consumes: UI primitives (Task 4), `requireSession` (Task 9), `nextTheme`/`THEME_COOKIE` (Task 3), `PRODUCTS` (Task 4).
- Produces:
  - `type Area = "SEO" | "GEO" | "AEO"`, `type ProductScores = { productId: ProductId; seo: number; geo: number; aeo: number; deltas: Record<Area, number>; trend: number[] }`, `type ActionPreview = { id: string; productId: ProductId; area: Area; impact: "high" | "medium" | "low"; title: string; effort: string }`, `type TodaySummary = { isSample: boolean; scannedAt: Date | null; headline: string; scores: ProductScores[]; actions: ActionPreview[] }`, `sampleToday(): TodaySummary`
  - `formatLongDate(date: Date, timeZone: string): string` → e.g. `"Thursday 1 October"`
  - `NAV_ITEMS: { label: string; href?: string; soon?: boolean }[]`

- [ ] **Step 1: Write failing tests**

`lib/format/date.test.ts`:
```ts
import { formatLongDate } from "./date";

describe("formatLongDate", () => {
  it("formats in the configured timezone", () => {
    // 05:00 UTC on 1 Oct is still 19:00 on 30 Sep in Honolulu (UTC-10, no DST).
    expect(formatLongDate(new Date("2026-10-01T05:00:00Z"), "Pacific/Honolulu")).toBe(
      "Wednesday 30 September",
    );
  });
});
```

`lib/today/sample.test.ts`:
```ts
import { PRODUCTS } from "@/lib/products/catalog";
import { sampleToday } from "./sample";

describe("sampleToday", () => {
  it("is clearly marked as sample data and covers every product", () => {
    const today = sampleToday();
    expect(today.isSample).toBe(true);
    expect(today.scannedAt).toBeNull();
    expect(today.scores.map((s) => s.productId)).toEqual(PRODUCTS.map((p) => p.id));
  });

  it("keeps scores within 0–100", () => {
    for (const s of sampleToday().scores) {
      for (const v of [s.seo, s.geo, s.aeo, ...s.trend]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
```

`components/today/ScoreTable.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { sampleToday } from "@/lib/today/sample";
import { ScoreTable } from "./ScoreTable";

describe("ScoreTable", () => {
  it("renders an accessible table with a row per product", () => {
    render(<ScoreTable scores={sampleToday().scores} />);
    const table = screen.getByRole("table", { name: "Visibility scores by product" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Product",
      "SEO",
      "GEO",
      "AEO",
      "30 days",
    ]);
    expect(within(table).getByRole("rowheader", { name: "Acme Docs" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/format lib/today components/today` → FAIL.

- [ ] **Step 3: Implement `lib/format/date.ts` and `lib/today/sample.ts`**

`lib/format/date.ts`:
```ts
/** "Thursday 1 October" in the given IANA timezone, British English. */
export function formatLongDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  })
    .format(date)
    .replace(",", "");
}
```

`lib/today/sample.ts`:
```ts
import type { ProductId } from "@/lib/products/catalog";

export type Area = "SEO" | "GEO" | "AEO";

export type ProductScores = {
  productId: ProductId;
  seo: number;
  geo: number;
  aeo: number;
  deltas: Record<Area, number>;
  trend: number[];
};

export type ActionPreview = {
  id: string;
  productId: ProductId;
  area: Area;
  impact: "high" | "medium" | "low";
  title: string;
  effort: string;
};

export type TodaySummary = {
  isSample: boolean;
  scannedAt: Date | null;
  headline: string;
  scores: ProductScores[];
  actions: ActionPreview[];
};

/** Placeholder data until the daily scan exists (Phase 3). Always flagged `isSample`. */
export function sampleToday(): TodaySummary {
  return {
    isSample: true,
    scannedAt: null,
    headline: "Calm waters. Two things worth your attention.",
    scores: [
      { productId: "acme-docs", seo: 62, geo: 18, aeo: 34, deltas: { SEO: 3, GEO: 0, AEO: 1 }, trend: [52, 55, 54, 58, 60, 62] },
      { productId: "lighthouse-cafe", seo: 48, geo: 9, aeo: 21, deltas: { SEO: 0, GEO: -2, AEO: 0 }, trend: [45, 44, 47, 46, 48, 48] },
      { productId: "fern-and-field", seo: 31, geo: 4, aeo: 12, deltas: { SEO: 1, GEO: 0, AEO: 0 }, trend: [26, 26, 27, 28, 30, 31] },
    ],
    actions: [
      { id: "sample-1", productId: "acme-docs", area: "GEO", impact: "high", title: "An AI assistant cites a competitor for one of your target questions", effort: "~1 hr" },
      { id: "sample-2", productId: "fern-and-field", area: "AEO", impact: "medium", title: "Add FAQ structured data to your most-visited page", effort: "~30 min" },
    ],
  };
}
```

- [ ] **Step 4: Implement Today components**

`components/today/ScoreTable.tsx`:
```tsx
import { Delta } from "@/components/ui/Delta";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Sparkline } from "@/components/ui/Sparkline";
import { productById } from "@/lib/products/catalog";
import type { Area, ProductScores } from "@/lib/today/sample";

const AREAS: { area: Area; key: "seo" | "geo" | "aeo" }[] = [
  { area: "SEO", key: "seo" },
  { area: "GEO", key: "geo" },
  { area: "AEO", key: "aeo" },
];

/** SEO/GEO/AEO scores per product with deltas and a 30-day trend. */
export function ScoreTable({ scores }: { scores: ProductScores[] }) {
  return (
    <Panel className="px-4">
      <table className="w-full text-sm" aria-label="Visibility scores by product">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-2.5 font-normal">Product</th>
            {AREAS.map(({ area }) => (
              <th key={area} scope="col" className="w-16 py-2.5 text-right font-normal">{area}</th>
            ))}
            <th scope="col" className="w-20 py-2.5 text-right font-normal">30 days</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => {
            const product = productById(row.productId);
            return (
              <tr key={row.productId} className="border-t border-line">
                <th scope="row" className="py-2.5 text-left font-normal">
                  <span className="inline-flex items-center gap-2">
                    <ProductDot productId={row.productId} />
                    {product.name}
                  </span>
                </th>
                {AREAS.map(({ area, key }) => (
                  <td key={area} className="py-2.5 text-right tabular-nums">
                    {row[key]}
                    <Delta value={row.deltas[area]} />
                  </td>
                ))}
                <td className="py-2.5 text-right">
                  <Sparkline values={row.trend} label={`${product.name} SEO trend over 30 days`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
```

`components/today/ActionCard.tsx`:
```tsx
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { productById } from "@/lib/products/catalog";
import type { ActionPreview } from "@/lib/today/sample";

const IMPACT_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

/** Compact action summary for Today. Buttons arrive with the Actions board (Phase 4). */
export function ActionCard({ action }: { action: ActionPreview }) {
  return (
    <Panel className="p-4">
      <article aria-labelledby={`action-${action.id}`}>
        <Tag tone={action.impact === "high" ? "warn" : "neutral"}>{IMPACT_LABEL[action.impact]}</Tag>
        <h3 id={`action-${action.id}`} className="mt-2 text-sm text-ink">{action.title}</h3>
        <p className="mt-1 text-xs text-ink-muted">
          {productById(action.productId).name} · {action.area} · {action.effort}
        </p>
      </article>
    </Panel>
  );
}
```

`components/today/TodayHeader.tsx`:
```tsx
import { formatLongDate } from "@/lib/format/date";

/** Date, scan status and the one-line headline. */
export function TodayHeader({
  now,
  timeZone,
  scannedAt,
  headline,
}: {
  now: Date;
  timeZone: string;
  scannedAt: Date | null;
  headline: string;
}) {
  return (
    <header>
      <p className="text-sm text-ink-muted">
        {formatLongDate(now, timeZone)} · {scannedAt ? "scan complete" : "no scan yet"}
      </p>
      <h1 className="mt-1 font-serif text-3xl leading-tight">{headline}</h1>
    </header>
  );
}
```

`components/today/SampleBanner.tsx`:
```tsx
/** Makes it impossible to mistake placeholder numbers for real data. */
export function SampleBanner() {
  return (
    <p role="note" className="rounded-sm bg-warn-soft px-3 py-2 text-xs text-warn">
      Sample data — real scores arrive when the daily scan is built (Phase 3).
    </p>
  );
}
```

- [ ] **Step 5: Implement the shell components**

`components/shell/nav-items.ts`:
```ts
export type NavItem = { label: string; href?: string; soon?: boolean };

/** Primary navigation. Items marked `soon` render disabled until their phase ships. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/" },
  { label: "Actions", soon: true },
  { label: "Second Brain", soon: true },
  { label: "Agents", soon: true },
  { label: "Devices", href: "/settings/devices" },
  { label: "Design system", href: "/design" },
];
```

`components/shell/NavLink.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const BASE = "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm";

/** Sidebar link with active state, or a disabled "soon" placeholder. */
export function NavLink({ href, children }: { href?: string; children: ReactNode }) {
  const pathname = usePathname();
  if (!href) {
    return (
      <span aria-disabled="true" className={`${BASE} cursor-default text-ink-muted opacity-60`}>
        {children}
        <span className="ml-auto text-2xs">soon</span>
      </span>
    );
  }
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${BASE} ${active ? "bg-surface text-ink shadow-[var(--shadow-hairline)]" : "text-ink-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
```

`components/shell/ThemeToggle.tsx`:
```tsx
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { nextTheme, THEME_COOKIE, type ThemePreference } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Cycles system → light → dark; persisted per device in a cookie. */
export function ThemeToggle({ initial }: { initial: ThemePreference }) {
  const [theme, setTheme] = useState(initial);
  const Icon = ICONS[theme];

  function cycle() {
    const next = nextTheme(theme);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=strict; secure`;
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted hover:text-ink"
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>Theme: {theme}</span>
    </button>
  );
}
```

`components/shell/LogoutButton.tsx`:
```tsx
"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/auth/client-api";

/** Ends the session on this device. */
export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await postJson("/api/auth/logout");
    router.replace("/login");
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink-muted hover:text-ink"
    >
      <LogOut aria-hidden="true" className="size-4" />
      <span>Sign out</span>
    </button>
  );
}
```

`components/shell/Sidebar.tsx`:
```tsx
import { ProductDot } from "@/components/ui/ProductDot";
import { PRODUCTS } from "@/lib/products/catalog";
import type { ThemePreference } from "@/lib/theme";
import { LogoutButton } from "./LogoutButton";
import { NavLink } from "./NavLink";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";

/** Left rail: brand, navigation, products, and device controls. */
export function Sidebar({ theme }: { theme: ThemePreference }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface-sunk p-3">
      <p className="px-2 pb-4 pt-1 font-serif text-xl">Harbour</p>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.label} href={item.href}>{item.label}</NavLink>
        ))}
      </nav>
      <section aria-labelledby="products-heading" className="mt-6">
        <h2 id="products-heading" className="px-2 pb-1 text-2xs uppercase tracking-widest text-ink-muted">
          Products
        </h2>
        <ul className="flex flex-col gap-0.5">
          {PRODUCTS.map((product) => (
            <li key={product.id}>
              <NavLink>
                <ProductDot productId={product.id} />
                {product.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        <ThemeToggle initial={theme} />
        <LogoutButton />
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Write the layout and Today page; delete the temporary page**

Run: `git rm app/page.tsx`

`app/(app)/layout.tsx`:
```tsx
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { requireSession } from "@/lib/auth/guard";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Sidebar theme={theme} />
      <main id="main" className="min-w-0 flex-1 px-10 py-8">
        {children}
      </main>
    </div>
  );
}
```

`app/(app)/page.tsx`:
```tsx
import { ActionCard } from "@/components/today/ActionCard";
import { SampleBanner } from "@/components/today/SampleBanner";
import { ScoreTable } from "@/components/today/ScoreTable";
import { TodayHeader } from "@/components/today/TodayHeader";
import { getConfig } from "@/lib/config";
import { sampleToday } from "@/lib/today/sample";

export default function TodayPage() {
  const today = sampleToday();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <TodayHeader
        now={new Date()}
        timeZone={getConfig().HARBOUR_TIMEZONE}
        scannedAt={today.scannedAt}
        headline={today.headline}
      />
      {today.isSample && <SampleBanner />}
      <ScoreTable scores={today.scores} />
      <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
        <h2 id="attention-heading" className="font-serif text-xl">Worth your attention</h2>
        {today.actions.map((action) => (
          <ActionCard key={action.id} action={action} />
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Run tests, gate, and view it**

Run: `pnpm vitest run && pnpm check` → PASS.
Run `pnpm dev`, sign in, and check Today in light, dark and system themes (toggle in the sidebar). Tab from the top of the page: the first stop is "Skip to content", then the nav links.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add app shell, Today page on sample data and theme toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Devices settings and /design page

**Files:**
- Create: `lib/auth/devices.ts`, `lib/auth/devices.test.ts`, `app/api/devices/setup-link/route.ts`, `app/api/devices/remove/route.ts`, `app/(app)/settings/devices/page.tsx`, `components/settings/DeviceList.tsx`, `components/settings/AddDeviceButton.tsx`, `app/(app)/design/page.tsx`, `components/design/TokenSwatches.tsx`

**Interfaces:**
- Consumes: `Db`, `passkeys`, `issueSetupToken`, `getSession`, `audit`, `rejectCrossSite`, UI primitives, `SEMANTIC_TOKENS`.
- Produces: `type DeviceSummary = { id: string; deviceLabel: string; createdAt: Date; lastUsedAt: Date | null }`, `listDevices(db, login): DeviceSummary[]`, `removeDevice(db, login, id): boolean`.

- [ ] **Step 1: Write failing test `lib/auth/devices.test.ts`**

```ts
import { passkeys } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { listDevices, removeDevice } from "./devices";

const t0 = new Date("2026-10-01T00:00:00Z");

function seed() {
  const db = openTestDb();
  const row = { publicKey: Buffer.from([1]), counter: 0, transports: null, createdAt: t0, lastUsedAt: null };
  db.insert(passkeys).values([
    { ...row, id: "a", login: "owner@example.com", deviceLabel: "Laptop" },
    { ...row, id: "b", login: "owner@example.com", deviceLabel: "Phone" },
    { ...row, id: "c", login: "other@example.com", deviceLabel: "Theirs" },
  ]).run();
  return db;
}

describe("devices", () => {
  it("lists only the signed-in login's passkeys", () => {
    expect(listDevices(seed(), "owner@example.com").map((d) => d.deviceLabel).sort()).toEqual(["Laptop", "Phone"]);
  });

  it("removes a passkey owned by the login", () => {
    const db = seed();
    expect(removeDevice(db, "owner@example.com", "a")).toBe(true);
    expect(listDevices(db, "owner@example.com").map((d) => d.id)).toEqual(["b"]);
  });

  it("cannot remove another login's passkey", () => {
    const db = seed();
    expect(removeDevice(db, "owner@example.com", "c")).toBe(false);
    expect(listDevices(db, "other@example.com")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run lib/auth/devices.test.ts` → FAIL.

- [ ] **Step 3: Implement `lib/auth/devices.ts`**

```ts
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { passkeys } from "@/lib/db/schema";

export type DeviceSummary = { id: string; deviceLabel: string; createdAt: Date; lastUsedAt: Date | null };

/** Passkeys registered for a login, oldest first. */
export function listDevices(db: Db, login: string): DeviceSummary[] {
  return db
    .select({ id: passkeys.id, deviceLabel: passkeys.deviceLabel, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt })
    .from(passkeys)
    .where(eq(passkeys.login, login))
    .orderBy(asc(passkeys.createdAt))
    .all();
}

/** Deletes one of the login's passkeys. False if it doesn't exist or isn't theirs. */
export function removeDevice(db: Db, login: string, id: string): boolean {
  const removed = db
    .delete(passkeys)
    .where(and(eq(passkeys.id, id), eq(passkeys.login, login)))
    .returning()
    .all();
  return removed.length === 1;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run lib/auth/devices.test.ts` → PASS.

- [ ] **Step 5: Write the device routes**

`app/api/devices/setup-link/route.ts`:
```ts
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth/guard";
import { issueSetupToken } from "@/lib/auth/setup-tokens";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

export async function POST(request: Request) {
  const config = getConfig();
  const blocked = rejectCrossSite(request, config.HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");

  const db = getDb();
  const { token, expiresAt } = issueSetupToken(db);
  audit(db, { login: session.login, event: "setup_token_issued", detail: { via: "settings" } });
  const url = new URL("/setup", config.HARBOUR_ORIGIN);
  url.searchParams.set("token", token);
  return Response.json({ url: url.toString(), expiresAt: expiresAt.toISOString() });
}
```

`app/api/devices/remove/route.ts`:
```ts
import { z } from "zod";
import { audit } from "@/lib/audit";
import { removeDevice } from "@/lib/auth/devices";
import { getSession } from "@/lib/auth/guard";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { jsonError } from "@/lib/http/responses";
import { rejectCrossSite } from "@/lib/http/same-origin";

const Body = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request, getConfig().HARBOUR_ORIGIN);
  if (blocked) return blocked;
  const session = await getSession();
  if (!session) return jsonError(401, "unauthenticated");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "invalid_request");

  const db = getDb();
  if (!removeDevice(db, session.login, body.data.id)) return jsonError(404, "not_found");
  audit(db, { login: session.login, event: "passkey_removed", detail: { id: body.data.id } });
  return Response.json({ ok: true });
}
```

- [ ] **Step 6: Write the device components and page**

`components/settings/AddDeviceButton.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";

/** Creates a one-time setup link to open on a new device. */
export function AddDeviceButton() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const result = await postJson<{ url: string }>("/api/devices/setup-link");
    if (result.ok) setLink(result.data.url);
    else setError("Couldn't create a setup link. Try again.");
  }

  return (
    <div className="space-y-3">
      <Button onClick={create}>Add a device</Button>
      {link && (
        <div className="space-y-1">
          <p className="text-sm text-ink-muted">Open this on the new device within 15 minutes. It works once.</p>
          <input
            readOnly
            aria-label="Setup link"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-xs"
          />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}
```

`components/settings/DeviceList.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/auth/client-api";
import type { DeviceSummary } from "@/lib/auth/devices";

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-US") : "never");

/** Registered passkeys with a remove control for lost devices. */
export function DeviceList({ devices }: { devices: DeviceSummary[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove(device: DeviceSummary) {
    if (!window.confirm(`Remove the passkey for “${device.deviceLabel}”?`)) return;
    const result = await postJson("/api/devices/remove", { id: device.id });
    if (!result.ok) return setError("Couldn't remove that device.");
    router.refresh();
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center gap-4 py-3">
            <div className="flex-1">
              <p className="text-sm">{device.deviceLabel}</p>
              <p className="text-xs text-ink-muted">
                Added {fmt(device.createdAt)} · last used {fmt(device.lastUsedAt)}
              </p>
            </div>
            <Button variant="ghost" onClick={() => remove(device)} aria-label={`Remove ${device.deviceLabel}`}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}
```

`app/(app)/settings/devices/page.tsx`:
```tsx
import { AddDeviceButton } from "@/components/settings/AddDeviceButton";
import { DeviceList } from "@/components/settings/DeviceList";
import { Panel } from "@/components/ui/Panel";
import { listDevices } from "@/lib/auth/devices";
import { requireSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";

export default async function DevicesPage() {
  const session = await requireSession();
  const devices = listDevices(getDb(), session.login);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl">Devices</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Passkeys that can open Harbour as {session.login}.
        </p>
      </header>
      <Panel className="px-4">
        <DeviceList devices={devices} />
      </Panel>
      <AddDeviceButton />
    </div>
  );
}
```

- [ ] **Step 7: Write the /design page**

`components/design/TokenSwatches.tsx`:
```tsx
import { SEMANTIC_TOKENS } from "@/design/token-list";

/** Every semantic token as a live swatch (re-renders correctly in each theme). */
export function TokenSwatches() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SEMANTIC_TOKENS.map((token) => (
        <li key={token.name} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-8 shrink-0 rounded-sm border border-line"
            style={{ background: `var(${token.name})` }}
          />
          <span>
            <code className="block font-mono text-xs">{token.name}</code>
            <span className="text-xs text-ink-muted">{token.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
```

`app/(app)/design/page.tsx`:
```tsx
import { TokenSwatches } from "@/components/design/TokenSwatches";
import { Button } from "@/components/ui/Button";
import { Delta } from "@/components/ui/Delta";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Sparkline } from "@/components/ui/Sparkline";
import { Tag } from "@/components/ui/Tag";
import type { ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-xl">{title}</h2>
      <Panel className="p-5">{children}</Panel>
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="font-serif text-3xl">Design system</h1>
        <p className="mt-1 text-sm text-ink-muted">Paper &amp; Tide. Edit values in design/tokens.css.</p>
      </header>
      <Section title="Colour tokens"><TokenSwatches /></Section>
      <Section title="Type">
        <p className="font-serif text-3xl">Newsreader — headings and reading</p>
        <p className="mt-2 text-sm">Inter — interface text, labels and tables.</p>
        <p className="mt-2 font-mono text-xs">JetBrains Mono — code and identifiers</p>
      </Section>
      <Section title="Components">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Tag>Accent</Tag>
          <Tag tone="warn">Warn</Tag>
          <Tag tone="neutral">Neutral</Tag>
          <span className="inline-flex items-center gap-2 text-sm"><ProductDot productId="acme-docs" />Acme Docs</span>
          <span className="inline-flex items-center gap-2 text-sm"><ProductDot productId="lighthouse-cafe" />Lighthouse Café</span>
          <span className="inline-flex items-center gap-2 text-sm"><ProductDot productId="fern-and-field" />Fern & Field</span>
          <span className="text-sm tabular-nums">62<Delta value={3} /></span>
          <span className="text-sm tabular-nums">9<Delta value={-2} /></span>
          <Sparkline values={[10, 14, 12, 18, 21, 25]} label="Example rising trend" />
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 8: Gate, view, commit**

Run: `pnpm check` → PASS. Run `pnpm dev`, open `/settings/devices` (create a link, remove a test device) and `/design` in both themes.
```bash
git add -A
git commit -m "feat: add device management and living design system page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Playwright end-to-end smoke tests

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `openDb`, `migrateDb`, `createSession`, `SESSION_COOKIE`.
- Produces: `pnpm test:e2e` running against a production build on `127.0.0.1:3401` with real proxy and session code.

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3401;
export const E2E_LOGIN = "e2e@example.com";
export const E2E_ORIGIN = `http://localhost:${PORT}`;
export const E2E_DB = "./data/e2e.db";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: E2E_ORIGIN,
    // Real Lock 1 mechanism: Tailscale Serve would add this header.
    extraHTTPHeaders: { "Tailscale-User-Login": E2E_LOGIN },
    storageState: "./data/e2e-storage.json",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    // The readiness probe sends no identity; Playwright counts a 403 as "up".
    env: {
      NODE_ENV: "production",
      HARBOUR_ALLOWED_LOGINS: E2E_LOGIN,
      HARBOUR_ORIGIN: E2E_ORIGIN,
      HARBOUR_RP_ID: "localhost",
      HARBOUR_DB_PATH: E2E_DB,
    },
  },
});
```

- [ ] **Step 2: Write `tests/e2e/global-setup.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { createSession } from "@/lib/auth/sessions";
import { migrateDb, openDb } from "@/lib/db/client";
import { E2E_DB, E2E_LOGIN } from "../../playwright.config";

/** Creates a real session with production code and hands its cookie to the browser. */
export default function globalSetup() {
  const db = openDb(E2E_DB);
  migrateDb(db);
  const { token, expiresAt } = createSession(db, E2E_LOGIN);
  mkdirSync("./data", { recursive: true });
  writeFileSync(
    "./data/e2e-storage.json",
    JSON.stringify({
      cookies: [
        {
          name: SESSION_COOKIE,
          value: token,
          domain: "localhost",
          path: "/",
          expires: Math.floor(expiresAt.getTime() / 1000),
          httpOnly: true,
          secure: true,
          sameSite: "Strict",
        },
      ],
      origins: [],
    }),
  );
}
```

- [ ] **Step 3: Write `tests/e2e/shell.spec.ts`**

```ts
import { expect, request, test } from "@playwright/test";
import { E2E_ORIGIN } from "../../playwright.config";

test("rejects requests without a Tailscale identity", async () => {
  const anonymous = await request.newContext({ baseURL: E2E_ORIGIN });
  const response = await anonymous.get("/");
  expect(response.status()).toBe(403);
  await anonymous.dispose();
});

test("rejects an identity that is not allowlisted", async () => {
  const intruder = await request.newContext({
    baseURL: E2E_ORIGIN,
    extraHTTPHeaders: { "Tailscale-User-Login": "intruder@example.com" },
  });
  expect((await intruder.get("/")).status()).toBe(403);
  await intruder.dispose();
});

test.describe("without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in with passkey" })).toBeVisible();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("Today renders scores and actions", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Calm waters");
      await expect(page.getByRole("note")).toContainText("Sample data");
      const table = page.getByRole("table", { name: "Visibility scores by product" });
      await expect(table.getByRole("rowheader", { name: "Fern & Field" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Worth your attention" })).toBeVisible();
    });

    test("design system page renders every section", async ({ page }) => {
      await page.goto("/design");
      for (const name of ["Colour tokens", "Type", "Components"]) {
        await expect(page.getByRole("heading", { name })).toBeVisible();
      }
    });
  });
}

test("keyboard: skip link first, then navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Today" })).toBeFocused();
});

test("serves a nonce-based CSP", async ({ page }) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
});
```

- [ ] **Step 4: Install the browser and run**

Run: `pnpm exec playwright install chromium && pnpm test:e2e`
Expected: all tests pass (2 identity, 1 redirect, 4 themed, 1 keyboard, 1 CSP = 9).

- [ ] **Step 5: Gate and commit**

Run: `pnpm check` → PASS.
```bash
git add -A
git commit -m "test: add Playwright smoke tests for auth gate, Today and design pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Deployment — systemd and Tailscale Serve

**Files:**
- Create: `deploy/harbour-web.service.template`, `deploy/install.sh`, `deploy/README.md`

**Interfaces:**
- Consumes: `pnpm build`, `pnpm start` (port 3400), `.env`.
- Produces: user service `harbour-web.service`; Harbour at `https://<machine>.<tailnet>.ts.net`.

- [ ] **Step 1: Write `deploy/harbour-web.service.template`**

```ini
[Unit]
Description=Harbour web (Next.js on 127.0.0.1:3400)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=__REPO__
Environment=NODE_ENV=production
Environment=PATH=__NODE_BIN__:/usr/bin:/bin
ExecStart=__NODE_BIN__/pnpm start
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
```

- [ ] **Step 2: Write `deploy/install.sh`**

```bash
#!/usr/bin/env bash
# Installs Harbour as a systemd user service and exposes it on the tailnet via Tailscale Serve.
# Run from the repo root on the Harbour PC: ./deploy/install.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(dirname "$(command -v node)")"
UNIT_DIR="$HOME/.config/systemd/user"
MAGIC_DNS="$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')"

if [[ ! -f "$REPO/.env" ]]; then
  echo "Missing $REPO/.env — copy .env.example and fill it in first." >&2
  exit 1
fi
chmod 600 "$REPO/.env"

echo "Expected in .env:"
echo "  HARBOUR_ORIGIN=https://$MAGIC_DNS"
echo "  HARBOUR_RP_ID=$MAGIC_DNS"
grep -q "^HARBOUR_ORIGIN=https://$MAGIC_DNS$" "$REPO/.env" || { echo "HARBOUR_ORIGIN does not match." >&2; exit 1; }
grep -q "^HARBOUR_RP_ID=$MAGIC_DNS$" "$REPO/.env" || { echo "HARBOUR_RP_ID does not match." >&2; exit 1; }
if grep -q "^HARBOUR_DEV_IDENTITY=" "$REPO/.env"; then
  echo "Remove HARBOUR_DEV_IDENTITY from .env before installing." >&2
  exit 1
fi

(cd "$REPO" && pnpm install --frozen-lockfile && pnpm build)

mkdir -p "$UNIT_DIR"
sed -e "s|__REPO__|$REPO|g" -e "s|__NODE_BIN__|$NODE_BIN|g" \
  "$REPO/deploy/harbour-web.service.template" > "$UNIT_DIR/harbour-web.service"
systemctl --user daemon-reload
systemctl --user enable --now harbour-web.service

tailscale serve --bg --https=443 http://127.0.0.1:3400

echo
echo "Harbour is running at https://$MAGIC_DNS"
echo "To keep it running after reboot without logging in, run once:  sudo loginctl enable-linger $USER"
echo "Register your first passkey:  pnpm setup-token"
```

Run: `chmod +x deploy/install.sh`

- [ ] **Step 3: Write `deploy/README.md`**

````markdown
# Deploying Harbour

Harbour runs on the always-on PC as a systemd **user** service bound to `127.0.0.1:3400`.
Tailscale Serve publishes it over HTTPS to your tailnet only and adds the
`Tailscale-User-Login` header that Lock 1 checks.

## First install

1. `cp .env.example .env` and set:
   - `HARBOUR_ALLOWED_LOGINS` — your Tailscale login (shown by `tailscale status --json` under `User`).
   - `HARBOUR_ORIGIN` / `HARBOUR_RP_ID` — the script prints the exact values for this machine.
2. `./deploy/install.sh`
3. `sudo loginctl enable-linger $USER` (once) so the service starts at boot.
4. `pnpm setup-token` and open the printed link on your first device to create a passkey.
5. Add more devices from **Devices → Add a device** on a signed-in device.

## Verify the locks

```bash
# Not reachable from the LAN (only loopback is bound): expect "connection refused".
curl -m 3 http://$(hostname -I | awk '{print $1}'):3400/
# Direct to loopback without identity: expect 403.
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3400/
```
From another tailnet device, `https://<machine>.<tailnet>.ts.net` should show the passkey sign-in.

## Updating

```bash
git pull && pnpm install --frozen-lockfile && pnpm build && systemctl --user restart harbour-web
```

## Logs

`journalctl --user -u harbour-web -f`

## Lost every device

Run `pnpm setup-token` on the PC and register a new passkey, then remove lost
devices under **Devices**.
````

- [ ] **Step 4: Verify the install (manual, on the Harbour PC)**

Fill in `.env` as the README says, then run `./deploy/install.sh`, `pnpm setup-token`, and the curl checks in the README.
Expected: service `active (running)` (`systemctl --user status harbour-web`); LAN curl refused; loopback curl `403`; the tailnet URL shows the sign-in page; passkey setup and sign-in succeed from a second device.

- [ ] **Step 5: Commit**

```bash
git add deploy
git commit -m "chore: add systemd unit and Tailscale Serve install script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage (Phase 1)

| Spec requirement | Task |
|---|---|
| Next.js + TS strict, quality gates incl. file-size check, pre-commit | 1, 2 |
| Design system: primitives → semantic → components, light/dark, `/design` | 3, 4, 11 |
| Lock 1: Tailscale identity allowlist, loopback bind | 6, 13 |
| Lock 2: passkey per device, setup token bootstrap, hashed 30-day sliding sessions | 7, 8, 9, 11 |
| CSRF protection on mutations | 8 (same-origin + JSON-only) |
| Strict CSP + security headers | 6 |
| Secrets in `.env` mode 600, never to client | 1, 13 (`chmod 600`; config is server-only) |
| Audit log (logins, passkey changes) | 5, 8, 9, 11 |
| App layout, navigation, Today on placeholder data | 10 |
| SQLite + migrations | 5 |
| systemd + Tailscale Serve setup | 13 |
| Tests: auth refusals, e2e light/dark, keyboard | 6, 7, 8, 12 |

Spec note: CSRF uses a same-origin check plus JSON-only bodies with `SameSite=Strict` cookies (spec §10 updated to match). No separate CSRF token.
