# AGENTS.md — Harbour contributor guide

Rules for any AI agent (or human) working in this repo. Harbour is a long-lived
personal tool: optimise for code that is easy to read, change and delete.

Before non-trivial work, read the design spec in `docs/superpowers/specs/` and
keep changes consistent with it. If a change contradicts the spec, say so
explicitly and update the spec in the same change.

---

## Keep the codebase clean

### File size — refactor before it grows too large

| File type | Soft limit | Hard limit |
|---|---|---|
| React components (`*.tsx`) | 200 lines | 300 lines |
| Other TypeScript (`*.ts`) | 300 lines | 400 lines |
| Tests | 400 lines | 600 lines |
| CSS / tokens | 300 lines | 500 lines |

- **Soft limit:** when a file you touch is over it, split it as part of your
  change (or explain in the commit why not).
- **Hard limit:** never commit a file over it. Split the file — never raise the
  limit to fit one file. Changing a limit is a deliberate repo-wide decision that
  updates this table and the check script together.
- `pnpm check:files` enforces the hard limits (runs in `pnpm check` and the
  pre-commit hook). Generated files (migrations, lockfiles) are excluded.

### How to split

- Split by **responsibility**, not by line count: one module = one clear job you
  can describe in a sentence.
- Components: extract sub-components into a sibling folder
  (`components/today/ScoreTable/…`), hooks into `use*.ts`, pure logic into `lib/`.
- Modules: separate pure logic (easy to test) from I/O (db, network, fs).
- A folder with an `index.ts` exposes the public surface; internals stay private.

### Always-on rules

- **Leave it cleaner than you found it.** Fix small mess in files you touch;
  flag larger refactors instead of silently ballooning a change.
- **No dead code.** Delete unused exports, files, flags and commented-out code.
  Git remembers.
- **No duplication of logic.** Second copy → extract a shared helper.
- **Names say what things are.** No `utils.ts` dumping grounds; name modules by
  domain (`lib/scoring/geo.ts`, not `lib/helpers.ts`).
- **Functions stay small** (aim < 40 lines) with early returns over deep nesting.
- **Types are strict.** `strict: true`, no `any`, no non-null `!` without a
  comment explaining why it is safe. Validate external data (APIs, agent output,
  frontmatter) with zod at the boundary.
- **Comments explain why**, not what. Public functions get a one-line doc comment.
- **Dependencies are deliberate.** Prefer the platform and existing deps; justify
  any new package in the commit message.

---

## Architecture boundaries

- `app/` routes stay thin: parse input, call `lib/`, render. No business logic.
- `lib/collectors/*` only collect raw observations — never compute scores.
- `lib/scoring/*` is pure (no I/O) and versioned; formula changes bump the version.
- Every collector implements the shared `Collector` interface; new data sources
  are new modules, not branches inside existing ones.
- The web process never runs collectors or agents; it enqueues jobs for the worker.
- Agents only write inside the brain directory (`HARBOUR_BRAIN_DIR`) and only
  *propose* actions.

## Public repo hygiene

- This repo is public. Never commit personal data: real products, names, emails,
  hostnames, tailnet names, home paths or research. Use fictional examples
  (`example.com`, `owner@example.com`).
- The owner's products live in `harbour.config.json` and the Second Brain in
  `HARBOUR_BRAIN_DIR`; both are gitignored and the brain belongs in its own private repo.
- **Check for private or sensitive data before every commit and push.** Review the
  staged diff (`git diff --cached`) and the commit message for: secrets (API keys,
  tokens, passwords, private keys, `.env` contents), personal information (names,
  emails, phone numbers, addresses, locations), machine or network identifiers
  (hostnames, tailnet names, IPs, home paths), and the owner's real products, clients
  or research. Replace them with fictional examples or move them to gitignored files.
  If anything sensitive was already committed, stop and tell the owner before pushing:
  removing it later means rewriting history.
- `pnpm check:private` (in the pre-commit and pre-push hooks) scans for secret patterns
  and for the owner's own terms listed in the gitignored `.private-terms` file. It
  supports this review but does not replace it.

## README

`README.md` is the front door for anyone discovering Harbour. Keep it current,
clear and easy to understand.

- **Update it in the same change** whenever you add or change a feature,
  setting (`HARBOUR_*` variable or `harbour.config.json` field), command, script,
  route, dependency requirement, or setup or deploy step. A change that makes the
  README wrong is not done.
- **Write for a newcomer.** Lead with what Harbour is and why it exists, then how
  to run it. Use short sections, plain language and copy-pasteable commands.
  Explain jargon the first time it appears.
- **Keep it accurate.** Every command must work as written, every setting must
  match `lib/config.ts` and `.env.example`, and every link must resolve. Remove
  anything that is no longer true.
- **Keep it focused.** Point to deeper docs (`deploy/README.md`,
  `docs/superpowers/`, `SECURITY.md`) instead of duplicating them, and keep the
  roadmap honest about what is built and what is planned.

## Design system

- Components use **semantic tokens only** (`--surface`, `--ink`, `--accent`…).
  Never hardcode colours, and never reference primitive palette tokens directly
  in components.
- Text sizes in rem via the type scale; no arbitrary px font sizes.
- Every new component works in light and dark, and appears on `/design`.
- Accessibility is part of done: accessible names, visible focus, full keyboard
  path, one owner per interactive label.
- **Plain language** (`docs/superpowers/specs/2026-10-02-plain-language-ux-design.md`): lead
  with a verdict or a plain sentence and keep the number small beside it; keep one line always
  visible and the rest behind "What's this?" (`<Explainer>`); put codes (SEO/GEO/AEO,
  sub-score keys, `HARBOUR_*` names, raw errors) only inside `<TechnicalDetails>` or setup
  steps. Area names, verdicts, sub-score, data-source and action wording come from
  `lib/explain/` — never a second copy in a component. Every message says what happened,
  whether it matters and what to do.
  A visibility check is called "check" (button: Check now), never "scan"; command names, API
  routes and settings keep *scan*.

## Reliability and security

- A caught failure is recorded or propagated — never logged and turned into
  success or an empty result. Missing data is a gap, never a zero.
- Bound every loop, retry, crawl and process (caps, timeouts, backoff, terminal
  failure state).
- Secrets live only in `.env` and server/worker code; nothing secret reaches the
  client bundle. Settings shows key status, never values.
- Treat agent output, fetched pages and markdown as untrusted: validate and
  sanitise.

## Testing

- New logic ships with tests; bug fixes ship with a regression test that fails
  without the fix.
- Tests bind the real production code path, not test-only copies.
- No paid API calls in tests — use recorded fixtures.
- Run `pnpm check` (typecheck, lint, format, size, tests) before committing.

## Commits

- Small, focused commits with a clear message (`feat:`, `fix:`, `refactor:`,
  `docs:`, `test:`, `chore:`). Refactors go in their own commit where practical.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
