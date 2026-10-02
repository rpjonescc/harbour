# Plain-language UX step 5 and scoring v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2, "make Harbour beautiful with its current features". (1) The owner sees one word, **check**, wherever Harbour used to say "scan". (2) Settings, Agents, Sources and Devices read like the rest of the app: one plain line per section, "Connected" / "Not connected yet", buttons and logs in plain words, raw errors and setting names only inside Technical details. (3) The leftovers from steps 2 to 4 are tidied (verdict colours, who's on it for issue cards, one clear name for "Worth doing"). (4) Scoring v2: Preferred Sources only weighs on news sites.

**Architecture:** Same pattern as steps 1 to 4. Fixed words live in `lib/explain/` (pure, tested) and the components compose the step 1 pieces (`Explainer`, `TechnicalDetails`, `EmptyState`, `VerdictLine`). A source-scanning vocabulary test (Task 1) keeps "scan" from creeping back into on-screen strings. Scoring v2 adds `kind` to the product config, threads it to the pure scorer and the rules through `ScoreContext` and `evaluateRules`, bumps `FORMULA_VERSION` to `v2`, and shows a one-line note on the Product page while a version change sits in the 30-day trend window. No schema change, no migration, no stored value rewritten.

**Tech Stack:** existing stack only (Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 semantic tokens, Drizzle/SQLite, zod 4, Vitest + Testing Library (`fireEvent`; no user-event), Playwright, Biome, pnpm). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§2 principles, §3 vocabulary, §5.4 Settings and Agents, §5.5 Messages, §6 Scoring change: Preferred Sources, §7 Testing, §8 order of work). **Rules:** `AGENTS.md`. **Builds on:** `docs/superpowers/plans/2026-10-02-plain-language-ux.md` (steps 1 and 2), `...-actions.md` (step 3) and `...-product-page.md` (step 4). **Ledger:** `.superpowers/sdd/progress.md` (the "Deferred" lines).

**Already built, reused here (do not recreate):**

- `components/explain/`: `VerdictLine`, `Explainer`, `TechnicalDetails` (`id`, `topic`, `children`; closed by default, remembered per `id`; its summary reads "Technical details (topic)" to screen readers, so every `topic` on a page must be different), `EmptyState` (`what`, `when`, `why`).
- `lib/explain/`: `AREAS`, `verdictFor`, `GAP_REASONS`, `SOURCES`, `sourceName`, `sourceExplanation(id)` (`gives`, `connect` steps, `status`), `sourceStatusPhrase(id, status)`, `NOT_COLLECTED_YET`, `IMPACT_PHRASE`, `EFFORT_PHRASE`, `STATUS_COLUMN`, `WHO_PHRASE`, `whoIsOnIt`, `scan-status.ts` phrases, `briefing.ts`.
- `components/settings/*` (a `SettingsSection` per card, `SectionPlacement`), `components/agents/*`, `components/sources/*`, `components/products/*`, `components/shell/Sidebar.tsx`.
- `lib/actions/views.ts` `ruleActionStatuses`, `eventsByAction`, `lastStatusActor`; `lib/actions/rule-sync.ts` `planRuleSync` (a rule outcome of `clear` resolves open, in-progress and snoozed actions; an outcome of `unknown` or no outcome leaves them alone).

## Global Constraints

Copied verbatim from the spec and `AGENTS.md` (plus the owner's design direction); every task's requirements include this section.

**The owner's design direction (binding)**

- Simple, few words. A clear headline plus one short line on any surface; details one click away (Technical details, a disclosure, a link). Calm, "get it" at a glance. If a surface needs a paragraph, cut it or fold it away.
- One owner-facing word for a visibility check: "check". CLI command names, API routes, setting names (`pnpm scan:now`, `POST /api/scans`, `HARBOUR_SCHEDULED_SCANS`) and stored values (`jobs.kind = "scan"`, action actor `scan`, stored evidence text) stay as they are.

**From the spec**

- "No change to what Harbour measures or stores."
- "No AI-generated explanations: the explanations are fixed, reviewed text."
- "The Second Brain viewer is unchanged."
- "**Meaning first, numbers second.** Lead with a verdict or a plain sentence, and keep the number small beside it for tracking."
- "**One sentence always visible, more on request.** Every score, section and status has a one-line plain explanation. "What's this?" opens the full four parts: what it is, why Harbour checks it, what to do, why it's worth it."
- "**Technical detail is never removed, only tucked away.** Raw evidence, sub-score keys, codes and formulas live behind a "Technical details" disclosure, closed by default."
- "**Every message answers "what happened, does it matter, what do I do".** No bare "failed", no environment-variable names as the message (they may appear inside Technical details or setup steps)."
- "**Calm density.** Fewer, larger, well-spaced items, with full tables one click away. No colour as the only signal."
- Wording: "collectors → data sources", "paid sources → paid data", "impact high/medium/low → Big win / Worth doing / Small win", "effort small/medium/large → quick job / an afternoon / a project". Action columns: "New ideas / To do / In progress / Done / Snoozed / Dismissed".
- §5.4: "Each section opens with one line on what it is for. Key and source status reads "Connected" or "Not connected yet", followed by how to connect it. Variable names appear only inside the setup steps."
- §5.5: "Every user-facing error, notice and empty state is rewritten per principle 4. Messages live beside their component or in `lib/explain/`, not scattered as inline literals across files."
- §6: "**Product config:** add optional `kind: "news" | "product"` to products in `harbour.config.json`, default `"product"`. Validate it with zod, and document it in the README and `harbour.config.example.json`." "**AEO formula v2:** For `product` sites, `aeo.preferredSources` becomes "freshness" only (3+ URLs updated in 30 days → 100) with weight 0.25. `news` sites keep the v1 definition. The formula version is bumped. History shows a note at the first v2 score: "Scoring updated: Preferred Sources now only counts for news sites."" "**Rule:** the `no-preferred-sources` rule only fires for `news` products. Existing open rule actions close through the normal rule-sync path, since the rule no longer applies."
- §7: "**E2E smoke (Today, Product, Actions, Settings):** the briefing or summary line is visible; no raw codes appear outside Technical details: no `SEO|GEO|AEO` as a heading, no `HARBOUR_[A-Z_]+`, no `geo.` or `aeo.` keys." "**Scoring v2:** the formula tests for product and news kinds, the version bump, and the rule gating."
- "Each component works in light and dark, uses semantic tokens only, is fully keyboard-accessible, and appears on `/design`."

**From AGENTS.md**

- File size: "React components (`*.tsx`) | 200 lines | 300 lines", "Other TypeScript (`*.ts`) | 300 lines | 400 lines", "Tests | 400 lines | 600 lines", "CSS / tokens | 300 lines | 500 lines". "**Hard limit:** never commit a file over it." A file you touch that is over its soft limit is split in the same change (or the commit says why not).
- "Components use **semantic tokens only** (`--surface`, `--ink`, `--accent`…). Never hardcode colours, and never reference primitive palette tokens directly in components."
- "Text sizes in rem via the type scale; no arbitrary px font sizes."
- "Accessibility is part of done: accessible names, visible focus, full keyboard path, one owner per interactive label."
- "A caught failure is recorded or propagated — never logged and turned into success or an empty result. Missing data is a gap, never a zero."
- "`lib/scan/scoring/*` is pure (no I/O) and versioned; formula changes bump the version." "`app/` routes stay thin."
- "**Types are strict.** `strict: true`, no `any`, no non-null `!` without a comment explaining why it is safe." (Biome errors on `!`, tests included: guard instead.) "Validate external data (APIs, agent output, frontmatter) with zod at the boundary."
- "**No dead code.**" "**No duplication of logic.** Second copy → extract a shared helper." "**Functions stay small** (aim < 40 lines)." "**Comments explain why**, not what. Public functions get a one-line doc comment."
- "Tests bind the real production code path, not test-only copies." "New logic ships with tests; bug fixes ship with a regression test that fails without the fix." "No paid API calls in tests — use recorded fixtures."
- "This repo is public. Never commit personal data… Use fictional examples (`example.com`, `owner@example.com`)." Fixtures here use Acme Docs (`https://docs.example.com`), Acme News, Lighthouse Café and Fern & Field.
- "`README.md` … **Update it in the same change** whenever you add or change a feature, setting (`HARBOUR_*` variable or `harbour.config.json` field)…" (Tasks 1, 7 and 10).
- "Small, focused commits with a clear message (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)." Every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use the line of the model that is actually executing the task). Never `--no-verify`.
- "Run `pnpm check` (typecheck, lint, format, size, tests) before committing."

**Environment**

- Node 22: prefix every command with `source ~/.nvm/nvm.sh &&`.
- Next.js 16 has breaking changes. This plan adds no new Next APIs: it uses `next/link`, `"use client"` components (props must be serialisable) and server components as already used here. If a step touches anything else, read the matching guide in `node_modules/next/dist/docs/` first.
- Code blocks may run past Biome's 100-column width: run `pnpm fix` before `pnpm lint` in every task.
- `lib/explain/**` may import **values** only from `lib/explain/**`, `lib/scan/labels.ts` and `lib/scan/scoring/sub-score.ts`; everything else is `import type` only (Task 9 enforces this with a test).
- E2E (`pnpm test:e2e`) is slow. Tasks 1 to 9 edit the e2e assertions their change breaks, in the same commit, and run only `pnpm check`; Task 10 runs the whole e2e suite once (on system Chrome through the throwaway config used in earlier steps; no browser download) and fixes anything missed.

## Review Focus

Inputs the spec implies that are most likely to bite the owner; each has a pinned test in the task named.

1. **A key that is "set" but unusable.** `HARBOUR_GSC_CREDENTIALS` pointing at a missing file must read "Not connected yet" with the reason (never "Connected"), and a paid key whose collector doesn't exist yet reads "Not available yet", not "Connected". Tests: Task 3.
2. **A config with no `kind`, or a wrong one.** A product without `kind` is a `product` (so every existing config silently gets v2 freshness-only scoring); `"kind": "blog"` is refused at load with a message naming the allowed values. Tests: Task 7.
3. **The first v2 score right after a v1 score.** AEO moves because the formula changed, not the site; the Product page says so for as long as the change sits in the 30-day window, and not for news sites (whose score did not change). Tests: Task 8.
4. **Old `no-preferred-sources` actions on a product site.** An open, in-progress or snoozed one resolves on the next good check through the normal sync; a dismissed or done one just stops being "present"; and if Readiness failed that check the action is left alone (a gap, not a resolution). Tests: Task 8.
5. **Two devices with the same name, a failed run with no error text, a backup folder that can't be opened.** Remove buttons keep unique accessible names; a failed run still says what to do; the unreadable-backup wording is the same on Today, in the briefing and in Settings. Tests: Tasks 2, 4, 5.

## Decisions (spec ambiguities resolved here)

1. **Where "scan" stays.** Only what a person reads on screen changes: text outside Technical details, the `/design` examples, and the history notes the rule sync writes on action cards (new notes say "check"; old stored notes keep their wording, since stored values are not rewritten). Identifiers, job and actor values, API routes, CLI, setting names, README command names, stored evidence text (`failed in this scan`, which `lib/explain/subscores/missing.ts` already translates), job event-log lines (they sit inside Technical details) and the hand-off prompt for Claude (`lib/scan/handoff.ts`, `lib/actions/handoff.ts`: read by Claude, not shown) stay. Step 4's Decision 7 (the Product page keeps "Scan now") is reversed by the owner's instruction.
2. **A test keeps it that way.** `tests/plain-vocabulary.test.ts` fails on any quoted string or one-line JSX text in the on-screen source files that contains the word scan, so a new "scan" cannot slip in. The e2e smoke check gains the same rule on rendered text (Task 10).
3. **"Worth doing" vs "Worth doing next".** Both come from the spec, and a "Worth doing" card under a "Worth doing next" heading reads as a stutter. The phrase is used on the board, in group headings, on Today cards, in README and in tests; the heading is one string on one component. Fix: rename Today's heading to **Next up** (short, plain, says what the list is) and update spec §5.1 in the same change (AGENTS.md: a change that contradicts the spec updates it). Rejected: renaming the medium phrase, which would change spec §3, the board and four test files for no extra clarity.
4. **Verdict colours.** `VerdictLine` colours Strong and Good with the `good` token, `SubScoreRow` used `accent`. One map wins: Strong and Good are green (`good`) everywhere, Fair stays neutral, Needs work stays warn. `Tag` gets a `good` tone; one test renders both components and compares.
5. **Issue-card chips.** The Product page issue card mirrors the Actions board card: two chips (size of win, who's on it, or the status phrase when nobody is) and a quiet line for the effort (plus "In progress" when someone is on it), instead of three chips. The impact tone becomes one function, `impactTone`, used by the board, Today and the issue card (Today used `accent` for Big win, the board `warn`).
6. **Settings: "API keys" becomes "Connections".** The section lists accounts and keys in plain words; paid sources read "Not available yet" (Harbour has no collector for them), matching the Product page panels (step 4, Decision 6). Setup steps and setting names sit in one Technical details per not-connected row; schedule setting names in one Technical details under the table.
7. **"Discovery" becomes "Find ideas"** on the Agents page and in job labels (the stored job kind stays `discovery`). Button accessible names change with it (`Find ideas for Acme Docs`), and the e2e names follow.
8. **Run page.** The headline is plain (Waiting for its turn / Running now / Done / Didn't finish / Stopped); the live log and a failed run's raw error go behind Technical details ("run log"), closed by default and remembered.
9. **Research targets** keep their name (the product's own settings page is out of scope); only the "waiting for approval" phrase becomes "waiting for your OK", from one helper shared by Settings and the Actions board's note.
10. **Sidebar badge.** "N open actions" becomes "N things worth doing", the same words as Today's sub-line (the badge counts open plus in-progress, so "to do" would undercount).
11. **Scoring v2 plumbing.** `Product.kind` is required (zod fills the default at load); `ScoreContext.productKind` carries it to the pure scorer; `evaluateRules` takes the kind as a required third argument (no default, so a missed caller fails typecheck). `aeo.preferredSources` keeps its key (stored breakdowns and the explain library are keyed on it); its plain name becomes "Fresh pages" for both kinds, and the news evidence still mentions the button.
12. **Closing old actions.** For a product site the rule returns `clear`, so the existing `planRuleSync` resolves the action with its ordinary note ("Resolved — not found in the check of …"). If Readiness didn't run ok that check, the rule's `needs` make the outcome `unknown` and the action waits for the next good check.
13. **The history note.** There is no score history list in the app, so "History shows a note at the first v2 score" is built as `formulaChange(db, productId, now)`: the newest change of formula version among the product's good scores in the 30-day trend window. `ProductHeader` shows its note under the area cards for product sites only. It disappears when the change leaves the window.
14. **Deferred items left alone, with reasons.** Actor list single source: already single (`ACTION_ACTORS`). `firstSentence` abbreviation: already handled. "Suggested card says New ideas and New idea, not decided yet": not reproducible (`ActionCard` shows the who phrase or the status, never both). "e2e inherits .env": needs an owner decision on CI. Light `--ink-muted` contrast: owner's colour call.

## File Structure

```
lib/explain/
  settings.ts (+test)         NEW  Settings intro and one purpose line per section
  approvals.ts (+test)        NEW  approvalsPhrase
  backups.ts (+test)          NEW  CANT_OPEN_BACKUP_FOLDER, BACKUP_HEALTH_LABEL
  claude.ts (+test)           NEW  CLAUDE_CONNECT_STEPS and the "not connected" lines
  keys.ts (+test)             NEW  keyPhrase, keyPurpose, keySteps
  agents.ts (+test)           NEW  Agents page words
  sources-page.ts (+test)     NEW  Sources page words
  scoring-notes.ts (+test)    NEW  the "Scoring updated" note
  actions.ts                  + impactTone, thingsWorthDoing
  sources.ts                  + export RESTART_WORKER
tests/plain-vocabulary.test.ts  NEW  no "scan" in on-screen strings
tests/helpers/plain-text.ts     NEW  textOutsideDetails for component tests
components/settings/   SettingsSection (purpose), SettingsOverview, ProductsCard, SchedulesCard,
                       KeyStatusCard, BackupCard, BudgetCard, BudgetReservations (NEW), DeviceList, AddDeviceButton
components/agents/     RunPanel, WeeklyAnalystPanel, ResearchRefreshPanel, JobList, RunActivity,
                       RunLog (NEW), RecoveryBanner, BrainSyncBanner
components/sources/    ConnectionList, ProductSourcesTable, ScheduleCard, SourcesOverview
components/products/   IssueItem, SubScoreRow, ProductHeader, ScoringNote (NEW)
components/ui/Tag.tsx  + good tone
lib/scan/              scoring/aeo.ts, scoring/inputs.ts, score.ts, issue-rules.ts, rule-def.ts, issues.ts,
                       store.ts, views.ts, product-view.ts, worker-deps.ts
lib/products/          config.ts, catalog.ts
harbour.config.example.json, README.md, the spec (§5.1, §5.4 and §6 "As built")
```

---

### Task 1: One word, "check", on every screen

**Files:**
- Create: `tests/plain-vocabulary.test.ts`
- Modify: every on-screen source in the table below; `README.md`; `tests/e2e/plain-language.ts`, `tests/e2e/shell.spec.ts`, `tests/e2e/scans.spec.ts`, `tests/e2e/settings.spec.ts`
- Modify (assertions): every unit test the grep in Step 4 lists

**Interfaces:**
- Produces: nothing new in code. `expectPlainLanguage(page)` also fails on the word scan in rendered text outside Technical details (used by Tasks 4, 5 and 10).

**On-screen strings that change** (found with `grep -rniE "\bscan(s|ned|ning)?\b"` over `components`, `app`, `lib/explain`, `lib/settings`, `lib/agents`, `lib/analyst`, `lib/actions`, `lib/ops`; this table is the whole list as of today; the test in Step 1 is the net for anything missed):

| File | Old | New |
|---|---|---|
| `components/products/ScanNowButton.tsx` | `Scan now` | `Check now` |
| `lib/explain/scan-status.ts` | `Harbour hasn't scanned this site yet; choose Scan now and the scores appear when it finishes.` | `Harbour hasn't checked this site yet; choose Check now and the scores appear when it finishes.` |
| same | `Scanning now (started …)`, `A scan is waiting to start`, ` Try Scan now.` | `Checking now (started …)`, `A check is waiting to start`, ` Try Check now.` |
| same | `Last scan …`, `…had a data source problem…`, `The last scan didn't finish…` | `Last check …`, same sentence, `The last check didn't finish…` |
| same (the Check now messages) | `Scan queued. It starts shortly.`, `A scan is already waiting to run.`, `Harbour couldn't start the scan. Try again in a moment.` | `Check queued. It starts shortly.`, `A check is already waiting to run.`, `Harbour couldn't start the check. Try again in a moment.` |
| `components/products/SearchConsolePanel.tsx` | delete `LAST_SCAN` and its comment; `LAST_SCAN(sourceStatusPhrase(ID, "failed"))` becomes `sourceStatusPhrase(ID, "failed")` | |
| same | `…no search data for this scan.`, `…with the next scan.`, doc comment "over the scan's 28 days" | `…for this check.`, `…with the next check.`, "over the check's 28 days" |
| `components/products/IssueList.tsx` | `No problems found in the last scan.` / `Harbour checks again with every scan.` / `They appear after the first scan finishes.` | `No problems found in the last check.` / `Harbour looks again at the next check.` / `They appear after the first check finishes.` |
| `components/products/PagesTable.tsx`, `ScoreBreakdown.tsx` | `They appear after the first scan finishes.` | `They appear after the first check finishes.` |
| `components/products/IssueItem.tsx` | `Tracking starts with the next scan`, `Done — still found in the last scan` | `…next check`, `…last check` |
| `components/actions/action-labels.ts` | `Found by a scan`, `Harbour's scan` | `Found by a check`, `Harbour's check` |
| same | `New things show up after each scan and each weekly report.`, `Finished items, and problems a scan no longer finds, appear here.`, `They arrive after each scan and each weekly report.`, `Run Scan now on a product page to get the first ones.` | the same sentences with check / Check now |
| `components/actions/SyncFailureNote.tsx` | `The last scan finished, but Harbour couldn't update the actions (…). The next scan tries again.` | `The last check finished, but Harbour couldn't update the actions (…). The next check tries again.` |
| `components/today/SampleBanner.tsx` | `Scan now` | `Check now` |
| `components/today/ScoreTable.tsx` | sr-only `Not enough scans for a trend yet` | `Not enough checks for a trend yet` |
| `components/sources/ProductSourcesTable.tsx` | `Next scan: …` (four), `Scan running now` / `Scan queued now`, `Last scan … (status)`, `Never scanned` | `Next check: …`, `Check running now` / `Check queued now`, `Last check … (status)`, `Never checked` |
| `components/sources/ScheduleCard.tsx` | `Daily scan`, `Off (HARBOUR_SCHEDULED_SCANS=off): scans run only when you choose Scan now.`, `When scans run` | `Daily check`, `Off (HARBOUR_SCHEDULED_SCANS=off): checks run only when you choose Check now.`, `When checks run` (Task 5 moves the setting name into Technical details) |
| `lib/settings/view.ts` | label `Daily scan` | `Daily check` |
| `lib/settings/key-status.ts` | `…Lighthouse scores in each scan` | `…in each check` |
| `lib/agents/view.ts` | `Scan: <name>` | `Check: <name>` |
| `lib/analyst/panel-view.ts` | `…if a product was scanned in the last 7 days` | `…if a product was checked in the last 7 days` (Task 4 rewrites the whole sentence) |
| `lib/actions/rule-sync.ts` | `Found in scan of`, `Still present in scan of`, `Back in scan of`, `Resolved — not found in scan of` | `Found in the check of`, `Still present in the check of`, `Back in the check of`, `Resolved — not found in the check of` |
| `lib/ops/backup-job.ts`, `lib/ops/retention.ts` (`describeRemoved` only; the CLI line stays) | `No old scans to prune…`, `Pruned the oldest N scans…`, `Removed N observations from M scans` | `No old checks to prune…`, `Pruned the oldest N checks…`, `Removed N observations from M checks` |
| `components/design/ScanExamples.tsx`, `app/(app)/design/page.tsx` | `Illustrative scores, scans and issues.`, `Visibility scan examples` | `…scores, checks and issues.`, `Visibility check examples` |
| `components/design/scan-example-data.ts` | `Never scanned`, `Running after a failed scan` | `Never checked`, `Running after a failed check` |
| `components/design/ops-example-data.ts` | `Daily scan`, `Removed 18,240 observations from 11 scans` | `Daily check`, `Removed 18,240 observations from 11 checks` |

Stay as they are on purpose: `jobs.kind`/actor values `"scan"`, `"/api/scans"`, `HARBOUR_SCHEDULED_SCANS`, `pnpm scan:now`, `lib/scan/` paths, stored evidence text, event-log lines, hand-off prompts, `lib/ops/retention.ts`' CLI line.

- [ ] **Step 1: Write the failing vocabulary test**

`tests/plain-vocabulary.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The on-screen source files: what a person reads is built from the strings in them. Stored
// values ("scan" as a job kind or an actor), API paths and comments are allowed; the e2e smoke
// check (tests/e2e/plain-language.ts) covers what the pages really render.
const ROOTS = [
  "components",
  "app/(app)",
  "lib/explain",
  "lib/settings",
  "lib/agents/view.ts",
  "lib/analyst/panel-view.ts",
  "lib/actions/rule-sync.ts",
  "lib/ops/backup-job.ts",
];
const WORD = /\bscan(?:s|ned|ning)?\b/i;
const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const JSX_TEXT = />[^<>{}\n]*\bscan(?:s|ned|ning)?\b[^<>{}\n]*</i;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

function sourcesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A stored value or API path, not words a person reads. */
const allowed = (text: string) => text === "scan" || text.includes("/api/scans");

function offences(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (COMMENT.test(line)) return [];
      const literals = [...line.matchAll(LITERAL)].map((m) =>
        m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, ""),
      );
      const bad = literals.some((text) => WORD.test(text) && !allowed(text));
      return bad || JSX_TEXT.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [];
    });
}

describe("plain vocabulary", () => {
  it("never says scan in a string the owner reads: the word is check", () => {
    const found = ROOTS.flatMap(sourcesUnder).flatMap(offences);
    expect(found).toEqual([]);
  });

  it("finds a violation when there is one", () => {
    const dir = join(process.cwd(), "components");
    const probe = sourcesUnder(dir)[0] ?? "";
    expect(probe).not.toBe("");
    // The detector itself: a quoted sentence and a JSX line are both caught, a stored value is not.
    expect(WORD.test("Last scan 1 Oct")).toBe(true);
    expect(JSX_TEXT.test("<p>Scan now</p>")).toBe(true);
    expect(allowed("scan")).toBe(true);
    expect(allowed("/api/scans")).toBe(true);
  });
});
```

Also extend `tests/e2e/plain-language.ts` `expectPlainLanguage`: add after the `HARBOUR_` assertion

```ts
  // One word for a visibility check: "check" (Decision 1).
  expect(text).not.toMatch(/\bscan(?:s|ned|ning)?\b/i);
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run tests/plain-vocabulary.test.ts`
Expected: FAIL; the first test lists the file:line of every string in the table.

- [ ] **Step 3: Apply the table**

Make each replacement in the table. For `SearchConsolePanel.tsx` also remove the now-unused `LAST_SCAN` constant. Keep plurals correct ("1 check", "2 checks"). Do not touch the "stay" list.

- [ ] **Step 4: Update the unit and e2e assertions the change breaks**

Run `source ~/.nvm/nvm.sh && pnpm vitest run` and update each failing assertion to the new wording from the table (the failures name the files: `scan-status.test.ts`, `ScanNowButton.test.tsx`, `ScanStatusNote.test.tsx`, `SearchConsolePanel.test.tsx`, `IssueItem.test.tsx`, `ActionBoard.test.tsx`, `SourcesOverview.test.tsx`, `SettingsOverview.test.tsx`, `rule-sync*.test.ts`, `view.test.ts`, `panel-view.test.ts`, `backup-job` and `retention` tests, `TodayView`/`ScoreTable` tests). Then the e2e files (not run until Task 10):

- `tests/e2e/shell.spec.ts` lines 160 to 164: `Running after a failed scan` to `Running after a failed check`; `The last scan didn't finish` to `The last check didn't finish`; `Try Scan now` to `Try Check now`.
- `tests/e2e/scans.spec.ts`: `/hasn't scanned this site yet/` to `/hasn't checked this site yet/`; button name `Scan now` to `Check now` (every use, and the test titles); `/^Last scan .+\.$/` to `/^Last check .+\.$/`; `/Last scan .+ \(ok\)/` to `/Last check .+ \(ok\)/`; `Never scanned` to `Never checked`.
- `tests/e2e/settings.spec.ts`: `["Daily scan", …]` to `["Daily check", …]`; `No old scans to prune` (two places) to `No old checks to prune`.

- [ ] **Step 5: README prose**

In `README.md` reword owner-facing prose from scan to check: the intro (lines 7 and 8), the Today, Product page, Actions, Sources and Agents feature descriptions (the bullets around lines 32 to 50 and 84), "Daily scans" (rename the heading "Daily checks", keep its anchor text in `lib/docs-links.ts` working: the link targets `#when-things-run`, which is a different heading), the product page and Actions paragraphs (around 587 to 635) and the sentences about `Scan now` (now **Check now**). Keep every code name verbatim: `pnpm scan:now`, `POST /api/scans`, `HARBOUR_SCHEDULED_SCANS`, `HARBOUR_OBSERVATION_SCANS_KEPT`, `HARBOUR_SCAN_ALLOW_LOOPBACK`, `scan_runs`. Add one sentence near the top of "Daily checks": "A visibility check is called a *check* on screen; the commands, API routes and settings keep the older word *scan* (`pnpm scan:now`, `HARBOUR_SCHEDULED_SCANS`)." Then run `grep -nE "\b[Ss]can(s|ned|ning)?\b" README.md`: every remaining hit must be a code span, a setting, a command, a route or that sentence.

- [ ] **Step 6: Run everything**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm check`
Expected: PASS (including `tests/plain-vocabulary.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): one word for a visibility check, check, on every screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings, part 1: purposes, products, backups and budget

**Files:**
- Create: `lib/explain/settings.ts`, `lib/explain/approvals.ts`, `lib/explain/backups.ts`, `components/settings/BudgetReservations.tsx`, `tests/helpers/plain-text.ts`
- Create (tests): `lib/explain/settings.test.ts`, `lib/explain/approvals.test.ts`, `lib/explain/backups.test.ts`, `components/settings/BackupCard.test.tsx`
- Modify: `components/settings/SettingsSection.tsx`, `SettingsOverview.tsx`, `ProductsCard.tsx`, `BackupCard.tsx`, `BudgetCard.tsx`, `components/actions/ApprovalsNote.tsx`, `components/today/BackupNotice.tsx`, `lib/explain/briefing.ts`
- Modify: every caller of `SettingsSection` (the other Settings cards, `components/design/OpsExamples.tsx`), `components/settings/SettingsOverview.test.tsx`, `tests/e2e/settings.spec.ts`

**Interfaces:**
- Produces: `SETTINGS_INTRO: { line: string; files: string }`, `SETTINGS_PURPOSE: Record<"products" | "schedules" | "connections" | "budget" | "backups" | "more", string>`; `approvalsPhrase(count: number): string`; `CANT_OPEN_BACKUP_FOLDER: string`, `BACKUP_HEALTH_LABEL: Record<BackupHealth, string>`; `SettingsSection` requires `purpose: string`; `textOutsideDetails(root: HTMLElement): string` (tests).
- Consumes: `TechnicalDetails`, `DocsLink`, `BackupHealth` (type), `formatShortDateTime`.

- [ ] **Step 1: Write the failing tests**

`lib/explain/settings.test.ts`:

```ts
import { SETTINGS_INTRO, SETTINGS_PURPOSE } from "./settings";

describe("Settings words", () => {
  it("gives every section one short, plain line that names no file or setting", () => {
    for (const line of Object.values(SETTINGS_PURPOSE)) {
      expect(line.length).toBeGreaterThan(10);
      expect(line.length).toBeLessThanOrEqual(110);
      expect(line.slice(0, -1)).not.toMatch(/[.!?]/); // one sentence
      expect(line).not.toMatch(/HARBOUR_|\.env|\.json/);
    }
  });

  it("keeps the file names for Technical details, out of the visible line", () => {
    expect(SETTINGS_INTRO.line).not.toMatch(/HARBOUR_|\.env|\.json/);
    expect(SETTINGS_INTRO.files).toContain(".env");
    expect(SETTINGS_INTRO.files).toContain("harbour.config.json");
  });
});
```

`lib/explain/approvals.test.ts`:

```ts
import { approvalsPhrase } from "./approvals";

describe("approvalsPhrase", () => {
  it("counts research targets waiting for the owner's OK", () => {
    expect(approvalsPhrase(1)).toBe("1 research target waiting for your OK");
    expect(approvalsPhrase(3)).toBe("3 research targets waiting for your OK");
  });
});
```

`lib/explain/backups.test.ts`:

```ts
import { BACKUP_HEALTH_LABEL, CANT_OPEN_BACKUP_FOLDER } from "./backups";

describe("backup words", () => {
  it("has a plain label for every health state", () => {
    expect(Object.keys(BACKUP_HEALTH_LABEL).sort()).toEqual(
      ["failed", "none-yet", "off", "ok", "stale", "unreadable"].sort(),
    );
  });

  it("says one thing about an unreadable folder", () => {
    expect(CANT_OPEN_BACKUP_FOLDER).toBe("Harbour can't open the backup folder");
    expect(BACKUP_HEALTH_LABEL.unreadable).toBe("Can't open the backup folder");
  });
});
```

`tests/helpers/plain-text.ts`:

```ts
/** The text of `root` with every <details> (Technical details) left out, as a person sees it closed. */
export function textOutsideDetails(root: HTMLElement): string {
  const copy = root.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return "";
  for (const details of copy.querySelectorAll("details")) details.remove();
  return copy.textContent ?? "";
}
```

`components/settings/BackupCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EXAMPLE_BACKUPS, EXAMPLE_ZONE } from "@/components/design/ops-example-data";
import { CANT_OPEN_BACKUP_FOLDER } from "@/lib/explain/backups";
import { buildBriefing } from "@/lib/explain/briefing";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { BackupNotice } from "../today/BackupNotice";
import { BackupCard } from "./BackupCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const zone = { timeZone: EXAMPLE_ZONE.timeZone, locale: "en-GB" };
const card = (health: keyof typeof EXAMPLE_BACKUPS, dirSet = false) =>
  render(
    <BackupCard backups={EXAMPLE_BACKUPS[health]} backupDirSet={dirSet} {...zone} section={{}} />,
  );

describe("BackupCard", () => {
  it("says it can't open the backup folder in the same words as Today and the briefing", () => {
    const { container, unmount } = card("unreadable");
    expect(container).toHaveTextContent(CANT_OPEN_BACKUP_FOLDER);
    expect(screen.getByText("Can't open the backup folder")).toBeInTheDocument();
    unmount();
    const notice = render(<BackupNotice backup={EXAMPLE_BACKUPS.unreadable} {...zone} />);
    expect(notice.container).toHaveTextContent(CANT_OPEN_BACKUP_FOLDER);
    const briefing = buildBriefing({
      products: [{ id: "a", name: "Acme Docs", scores: { seo: 80, geo: 80, aeo: 80 } }],
      work: [],
      failures: [],
      failedChecks: [],
      backup: "unreadable",
    });
    expect(briefing.subLine).toContain(CANT_OPEN_BACKUP_FOLDER);
  });

  it("keeps the folder setting and raw error text inside Technical details", () => {
    const { container } = card("failed", true);
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+/);
    expect(screen.getByText(/didn't finish/)).toBeInTheDocument();
    expect(screen.getAllByText(/Technical details/).length).toBeGreaterThan(0);
  });

  it("has a purpose line and a labelled region", () => {
    card("ok");
    expect(screen.getByRole("region", { name: "Backups" })).toHaveAccessibleDescription(
      "Spare copies of Harbour's data, kept in case something goes wrong.",
    );
  });
});
```

(`buildBriefing`'s input shape: use the existing `BriefingInput` from `lib/explain/briefing.ts`; if the field names differ from the sketch above, copy a fixture from `lib/explain/briefing.test.ts`.)

In `SettingsOverview.test.tsx`, replace the "says where the values come from" test with:

```tsx
  it("opens with a headline and one plain line, files and settings under Technical details", () => {
    const { container } = renderView();
    expect(screen.getByText(SETTINGS_INTRO.line)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+|\.env|harbour\.config/);
    const details = screen.getByText(/Technical details \(where settings live\)/).closest("details");
    expect(details).toHaveTextContent(SETTINGS_INTRO.files);
    expect(screen.getByRole("link", { name: /Configuration/ })).toHaveAttribute(
      "href",
      expect.stringContaining("#configuration"),
    );
  });

  it("gives every section its purpose line as its description", () => {
    renderView();
    const names = {
      Products: "products",
      Schedules: "schedules",
      Connections: "connections",
      Budget: "budget",
      Backups: "backups",
      "More settings": "more",
    } as const;
    for (const [name, key] of Object.entries(names)) {
      expect(section(name)).toHaveAccessibleDescription(SETTINGS_PURPOSE[key]);
    }
  });
```

(import `SETTINGS_INTRO`, `SETTINGS_PURPOSE` and `textOutsideDetails`; the section list `["Products", "Schedules", "API keys", …]` in the first test becomes `["Products", "Schedules", "Connections", "Budget", "Backups", "More settings"]`; the Products test's text expectations become `"Search Console site: sc-domain:example.com"`, `"Search Console: not set up for this site yet"` and the link name `"3 research targets waiting for your OK"`.)

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/settings.test.ts lib/explain/approvals.test.ts lib/explain/backups.test.ts components/settings`
Expected: FAIL (modules and props missing).

- [ ] **Step 3: Implement the words**

`lib/explain/settings.ts`:

```ts
/** The Settings page's own words: one plain line per section, files named only for Technical details. */
export const SETTINGS_INTRO = {
  line: "What Harbour is set up to do. To change something, use the steps under Technical details.",
  files:
    "Settings live in two files on the Harbour computer: .env and harbour.config.json. Edit them, then restart Harbour.",
} as const;

export const SETTINGS_PURPOSE = {
  products: "The sites Harbour watches for you.",
  schedules: "What Harbour does by itself, and when.",
  connections: "The accounts and keys Harbour uses to learn more about your sites.",
  budget: "How much Harbour may spend each month on paid data.",
  backups: "Spare copies of Harbour's data, kept in case something goes wrong.",
  more: "Where to change sources, devices and research for each site.",
} as const;
```

`lib/explain/approvals.ts`:

```ts
/** "3 research targets waiting for your OK": shared by Settings and the Actions board's note. */
export function approvalsPhrase(count: number): string {
  return `${count} research ${count === 1 ? "target" : "targets"} waiting for your OK`;
}
```

`lib/explain/backups.ts`:

```ts
import type { BackupHealth } from "@/lib/ops/backup-status";

/** One wording for the unreadable-folder case on Today, in the briefing and in Settings. */
export const CANT_OPEN_BACKUP_FOLDER = "Harbour can't open the backup folder";

export const BACKUP_HEALTH_LABEL: Readonly<Record<BackupHealth, string>> = {
  ok: "Up to date",
  "none-yet": "No backup yet",
  failed: "Last backup didn't finish",
  stale: "No recent backup",
  off: "Nightly backups are off",
  unreadable: "Can't open the backup folder",
};
```

In `BackupNotice.tsx` build `CANT_CHECK` as ``const CANT_CHECK = `Your live data is fine, but ${CANT_OPEN_BACKUP_FOLDER} to check your spare copies.` `` and, in the unreadable branch, start the sentence with ``{CANT_OPEN_BACKUP_FOLDER}`` (then `, so it can't check your spare copies.` and the rest unchanged).

In `briefing.ts` set `unreadable: CANT_OPEN_BACKUP_FOLDER`.

- [ ] **Step 4: Implement the components**

`SettingsSection.tsx`: add a required `purpose: string` prop; render it under the heading row and make it the section's description:

```tsx
  const headingId = useId();
  const purposeId = useId();
  ...
    <section id={anchor} aria-labelledby={headingId} aria-describedby={purposeId}
      className="flex scroll-mt-8 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={headingId} className="font-serif text-xl">{title}</Heading>
        {aside}
      </div>
      <p id={purposeId} className="text-sm text-ink-muted">{purpose}</p>
      <Panel className="flex flex-col gap-3 p-4">{children}</Panel>
    </section>
```

Each card passes `purpose={SETTINGS_PURPOSE.<key>}` (`products`, `schedules`, `connections`, `budget`, `backups`, `more`). `SettingsOverview` retitles the keys card in Task 3; here it renders the header:

```tsx
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="text-sm text-ink-muted">{SETTINGS_INTRO.line}</p>
        <TechnicalDetails id="settings-files" topic="where settings live">
          <p>
            {SETTINGS_INTRO.files}{" "}
            <DocsLink href={DOCS_LINKS.configuration}>Configuration</DocsLink>
          </p>
        </TechnicalDetails>
      </header>
```

and the "More settings" link `Devices (passkeys)` becomes `Devices`.

`ProductsCard.tsx`: the demo note becomes `These are example sites, not yours yet.`; the Search Console line becomes

```tsx
            <p className="text-xs text-ink-muted">
              {product.searchConsoleProperty ? (
                <>
                  Search Console site:{" "}
                  <code className="font-mono">{product.searchConsoleProperty}</code>
                </>
              ) : (
                "Search Console: not set up for this site yet"
              )}
            </p>
```

and the approvals link uses the shared phrase, with the product named for screen readers (two products can wait on the same number):

```tsx
                <Link href={`/settings/products/${product.id}`} className={LINK}>
                  {approvalsPhrase(product.awaitingApproval)}
                  <span className="sr-only"> for {product.name}</span>
                </Link>
```

`ApprovalsNote.tsx`: link text becomes `{productName}: {approvalsPhrase(count)}`.

`BackupCard.tsx` (replace the body; keep the props type, `HEALTH` becomes `BACKUP_HEALTH_LABEL` with the same tones):

```tsx
const TONE: Record<BackupHealth, "accent" | "warn" | "neutral"> = {
  ok: "accent", "none-yet": "neutral", failed: "warn", stale: "warn", off: "neutral", unreadable: "warn",
};

export function BackupCard(props: Props) {
  const { backups, backupDirSet, timeZone, locale, section, demo = false, buttonLabel } = props;
  const at = (date: Date) => formatShortDateTime(date, timeZone, locale);
  const { latest, lastFailure, lastRetention } = backups;
  return (
    <SettingsSection
      {...section}
      title="Backups"
      purpose={SETTINGS_PURPOSE.backups}
      aside={<Tag tone={TONE[backups.health]}>{BACKUP_HEALTH_LABEL[backups.health]}</Tag>}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {backups.count === null ? (
          <>
            <dt className="text-ink-muted">Backups</dt>
            <dd>{CANT_OPEN_BACKUP_FOLDER} — check its permissions</dd>
          </>
        ) : (
          <>
            <dt className="text-ink-muted">Last backup</dt>
            <dd>
              {latest ? `${at(latest.modifiedAt)} · ${(latest.bytes / 1_000_000).toFixed(1)} MB` : "No backup yet"}
            </dd>
            <dt className="text-ink-muted">Kept</dt>
            <dd>{backups.count} of {BACKUPS_KEPT}</dd>
          </>
        )}
        <dt className="text-ink-muted">Saved in</dt>
        <dd>{backupDirSet ? "A folder you chose" : "A backups folder next to the database"}</dd>
        <dt className="text-ink-muted">Old data</dt>
        <dd>
          {lastRetention ? (
            <Link href={`/agents/${lastRetention.jobId}`} className={LINK}>
              {at(lastRetention.at)}: {lastRetention.summary ?? lastRetention.status}
            </Link>
          ) : (
            "Not tidied yet. That happens after each backup."
          )}
        </dd>
      </dl>
      {lastFailure && (
        <div className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink">
          <p>
            <Link href={`/agents/${lastFailure.jobId}`} className={LINK}>
              The backup on {at(lastFailure.at)} didn't finish
            </Link>
            . Your live data is fine.
            {lastFailure.attemptsLeft > 0 &&
              ` Harbour tries again (${lastFailure.attemptsLeft} ${lastFailure.attemptsLeft === 1 ? "try" : "tries"} left).`}
          </p>
          <TechnicalDetails id="backup-failure" topic="what Harbour recorded about the failed backup">
            <p>{lastFailure.error}</p>
          </TechnicalDetails>
        </div>
      )}
      <BackUpNowButton demo={demo} label={buttonLabel} />
      <TechnicalDetails id="backup-setup" topic="where backups go and how to change it">
        <p>
          Backups go to <code className="font-mono">HARBOUR_BACKUP_DIR</code> when it is set in{" "}
          <code className="font-mono">.env</code>, otherwise next to the database. Back up now copies
          the database today, even when nightly backups are off.{" "}
          <DocsLink href={DOCS_LINKS.backups}>Backups and restore</DocsLink>
        </p>
      </TechnicalDetails>
    </SettingsSection>
  );
}
```

`/design` shows several cards on one page, so `TechnicalDetails` ids (`backup-failure`, `backup-setup`) repeat there; that is fine (the choice is remembered per id) but the `topic` must differ for screen readers: when `buttonLabel` is passed (the `/design` case) append it to the topics: `topic={`…${buttonLabel ? ` (${buttonLabel})` : ""}`}`.

`BudgetCard.tsx`: the cap row loses the setting name and the "no paid calls allowed" jargon:

```tsx
        <dt className="text-ink-muted">Most Harbour may spend</dt>
        <dd>{budget.capMicro > 0 ? `${aud(budget.capMicro)} a month` : `${aud(0)} — paid data is switched off`}</dd>
```

then the `CostMeter`, then `{reservations.length > 0 && <BudgetReservations reservations={reservations} timeZone={timeZone} locale={locale} />}`, then a `TechnicalDetails id="budget-setup" topic="how to change the monthly budget"` holding "Set `HARBOUR_MONTHLY_BUDGET_AUD` in `.env` and restart Harbour." and the existing `DocsLink` to `DOCS_LINKS.costs` ("How costs and the budget work"). Move the reservations table to `components/settings/BudgetReservations.tsx` (BudgetCard was near its soft limit): a visible line `{n} paid {n === 1 ? "call is" : "calls are"} still being counted.` plus the old table inside `<TechnicalDetails id="budget-reservations" topic="paid calls still being counted">` with column headers `Reserved`, `Source` (use `sourceName(r.collector)` from `lib/explain/sources`), `Product`, `Run`, `Set aside`. This removes the `level` prop use.

- [ ] **Step 5: Update the e2e assertions**

`tests/e2e/settings.spec.ts`: the Budget and Backups assertions that read `Monthly cap`, `Unconfirmed reservations`, `Retention` or the unreadable text become the new labels (`Most Harbour may spend`, `Old data`, `Can't open the backup folder`); `settingsRegion(page, "API keys")` and the table name change in Task 3.

- [ ] **Step 6: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run lib/explain components/settings components/today components/actions components/design`
Expected: PASS. Then `pnpm check`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): plain Settings sections, products, backups and budget" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Settings, part 2: connections and schedules

**Files:**
- Create: `lib/explain/claude.ts`, `lib/explain/keys.ts`
- Create (tests): `lib/explain/claude.test.ts`, `lib/explain/keys.test.ts`
- Modify: `lib/explain/sources.ts` (export `RESTART_WORKER`), `lib/settings/key-status.ts` (remove `usedFor`), `lib/costs/paid-sources.ts` (remove `provides` if it becomes unused), `lib/settings/view.ts` (labels), `components/settings/KeyStatusCard.tsx`, `SchedulesCard.tsx`, `SettingsOverview.tsx`, `components/design/ops-example-data.ts`
- Modify (tests): `lib/settings/key-status.test.ts`, `lib/settings/view.test.ts`, `components/settings/SettingsOverview.test.tsx`, `tests/e2e/settings.spec.ts`

**Interfaces:**
- Produces: `CLAUDE_CONNECT_STEPS: readonly string[]`, `CLAUDE_PURPOSE: string`, `CLAUDE_OFF: string` ("Claude isn't connected yet, so the Run buttons are switched off."), `CLAUDE_OFF_HERE: string` ("Connect Claude first: the note at the top of this page says how."); `keyPhrase(row): { text: string; tone: "accent" | "warn" | "neutral"; note: string | null }`, `keyPurpose(id: string): string`, `keySteps(id: string): readonly string[]`; `RESTART_WORKER` exported from `lib/explain/sources.ts`.
- Consumes: `KeyRow` (type), `sourceExplanation`, `TechnicalDetails`, `SETTINGS_PURPOSE`.

- [ ] **Step 1: Write the failing tests**

`lib/explain/claude.test.ts`:

```ts
import { CLAUDE_CONNECT_STEPS, CLAUDE_OFF, CLAUDE_OFF_HERE } from "./claude";

describe("Claude connection words", () => {
  it("keeps the setting name in the steps, never in the visible lines", () => {
    expect(CLAUDE_CONNECT_STEPS.join(" ")).toContain("HARBOUR_CLAUDE_OAUTH_TOKEN");
    expect(CLAUDE_CONNECT_STEPS.join(" ")).toContain("claude setup-token");
    for (const line of [CLAUDE_OFF, CLAUDE_OFF_HERE]) expect(line).not.toMatch(/HARBOUR_/);
  });
});
```

`lib/explain/keys.test.ts` (uses the real rows):

```ts
import { parseConfig } from "@/lib/config";
import { keyStatusRows } from "@/lib/settings/key-status";
import { keyPhrase, keyPurpose, keySteps } from "./keys";

const BASE = {
  HARBOUR_ALLOWED_LOGINS: "owner@example.com",
  HARBOUR_ORIGIN: "https://harbour.example.ts.net",
  HARBOUR_RP_ID: "harbour.example.ts.net",
};
const rows = (env: Record<string, string> = {}, fileExists = () => true) =>
  keyStatusRows(parseConfig({ ...BASE, ...env }), fileExists);
const row = (id: string, env: Record<string, string> = {}, fileExists = () => true) => {
  const found = rows(env, fileExists).find((r) => r.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
};

describe("keys", () => {
  it("has a purpose and setup steps for every key Harbour lists", () => {
    for (const { id } of rows()) {
      expect(keyPurpose(id).length).toBeGreaterThan(10);
      expect(keySteps(id).length).toBeGreaterThan(0);
    }
  });

  it("reads Connected for a key that is set and in use", () => {
    expect(keyPhrase(row("pagespeed", { HARBOUR_PAGESPEED_API_KEY: "x" }))).toEqual({
      text: "Connected", tone: "accent", note: null,
    });
  });

  it("reads Not connected yet for a missing key", () => {
    expect(keyPhrase(row("claude")).text).toBe("Not connected yet");
  });

  it("never says Connected for a credentials file Harbour can't find, and says why", () => {
    const gsc = row("search-console", { HARBOUR_GSC_CREDENTIALS: "/srv/example/gsc.json" }, () => false);
    const phrase = keyPhrase(gsc);
    expect(phrase.text).toBe("Not connected yet");
    expect(phrase.tone).toBe("warn");
    expect(phrase.note).toContain("can't find the credentials file");
  });

  it("reads Not available yet for a paid source Harbour doesn't collect, even with its key set", () => {
    const phrase = keyPhrase(row("openai", { HARBOUR_OPENAI_API_KEY: "x" }));
    expect(phrase.text).toBe("Not available yet");
  });
});
```

Replace the `SettingsOverview.test.tsx` API-keys tests with:

```tsx
  it("reads Connected or Not connected yet, with the setting names only in Technical details", () => {
    const { container } = renderView();
    const connections = within(section("Connections"));
    expect(connections.getByRole("table", { name: "Connections and whether each is connected" })).toBeInTheDocument();
    expect(connections.getAllByText(/^(Connected|Not connected yet|Not available yet)$/).length).toBeGreaterThan(0);
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+/);
  });

  it("gives each not-connected row its own setup steps with a unique accessible name", () => {
    renderView();
    const names = screen.getAllByText(/Technical details \(how to connect /).map((el) => el.textContent);
    expect(new Set(names).size).toBe(names.length);
  });

  it("turns schedule setting names into steps under one Technical details", () => {
    const { container } = renderView();
    expect(within(section("Schedules")).getByText("Daily check")).toBeInTheDocument();
    expect(within(section("Schedules")).getByText("Weekly report")).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_SCHEDULED/);
    expect(
      within(section("Schedules")).getByText(/Technical details \(how to turn a schedule on or off\)/),
    ).toBeInTheDocument();
  });
```

(`EXAMPLE_SETTINGS.keys` is the fixture the first test reads; update `ops-example-data.ts` rows to drop `usedFor` and keep fictional ids.)

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/claude.test.ts lib/explain/keys.test.ts components/settings`
Expected: FAIL.

- [ ] **Step 3: Implement the words**

In `lib/explain/sources.ts` change `const RESTART =` to `export const RESTART_WORKER =` (rename its uses).

`lib/explain/claude.ts`:

```ts
import { RESTART_WORKER } from "./sources";

/** What Claude does for Harbour, in one line. */
export const CLAUDE_PURPOSE = "Lets Claude write your research, ideas and the weekly report.";

/** Shown at the top of the Agents page while Claude isn't connected. */
export const CLAUDE_OFF = "Claude isn't connected yet, so the Run buttons are switched off.";

/** The short reason on each disabled button's panel. */
export const CLAUDE_OFF_HERE = "Connect Claude first: the note at the top of this page says how.";

/** The setting name appears only here, inside setup steps. */
export const CLAUDE_CONNECT_STEPS: readonly string[] = [
  "On the Harbour computer, run: claude setup-token",
  "Add the token it prints to .env as HARBOUR_CLAUDE_OAUTH_TOKEN.",
  RESTART_WORKER,
];
```

`lib/explain/keys.ts`:

```ts
import type { KeyRow } from "@/lib/settings/key-status";
import { CLAUDE_CONNECT_STEPS, CLAUDE_PURPOSE } from "./claude";
import { sourceExplanation } from "./sources";

export type KeyPhrase = { text: string; tone: "accent" | "warn" | "neutral"; note: string | null };

/** Where a key stands in plain words: Connected, Not connected yet, or Not available yet. */
export function keyPhrase(row: Pick<KeyRow, "status" | "inUse">): KeyPhrase {
  if (!row.inUse) return { text: "Not available yet", tone: "neutral", note: null };
  if (row.status === "present") return { text: "Connected", tone: "accent", note: null };
  if (row.status === "file-not-found") {
    return {
      text: "Not connected yet",
      tone: "warn",
      note: "Harbour can't find the credentials file you set up. Check the steps below.",
    };
  }
  return { text: "Not connected yet", tone: "neutral", note: null };
}

/** What the key gives Harbour, in one sentence. */
export function keyPurpose(id: string): string {
  return id === "claude" ? CLAUDE_PURPOSE : sourceExplanation(id).gives;
}

/** How to connect it; the setting names live only in these steps. */
export function keySteps(id: string): readonly string[] {
  return id === "claude" ? CLAUDE_CONNECT_STEPS : sourceExplanation(id).connect;
}
```

In `lib/settings/key-status.ts` delete `usedFor` from `KeyRow` and from every row (and the `usedFor` assertions in its test); if `PAID_SOURCES[].provides` is now unused anywhere, delete it from `lib/costs/paid-sources.ts` and its test. In `lib/settings/view.ts` set the schedule labels `Daily check`, `Weekly report`, `Monthly research refresh`, `Nightly backup` (also in `ops-example-data.ts`).

- [ ] **Step 4: Implement the components**

`KeyStatusCard.tsx`:

```tsx
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";
import { keyPhrase, keyPurpose, keySteps } from "@/lib/explain/keys";
import { SETTINGS_PURPOSE } from "@/lib/explain/settings";
import type { KeyRow } from "@/lib/settings/key-status";
import { type SectionPlacement, SettingsSection } from "./SettingsSection";

const CELL = "py-2 pr-3 align-top";
const DOCS: Record<string, { href: string; label: string } | undefined> = {
  pagespeed: { href: DOCS_LINKS.pagespeed, label: "Connect PageSpeed" },
  "search-console": { href: DOCS_LINKS.searchConsole, label: "Connect Search Console" },
};

function Setup({ row }: { row: KeyRow }) {
  const docs = DOCS[row.id];
  return (
    <TechnicalDetails id={`connect-${row.id}`} topic={`how to connect ${row.label}`}>
      <ol className="list-decimal pl-4">
        {keySteps(row.id).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {docs && <DocsLink href={docs.href}>{docs.label}</DocsLink>}
    </TechnicalDetails>
  );
}

/** Whether each account or key is connected: status and steps only, never a value or a path. */
export function KeyStatusCard({ keys, section }: { keys: KeyRow[]; section?: SectionPlacement }) {
  return (
    <SettingsSection {...section} title="Connections" purpose={SETTINGS_PURPOSE.connections}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Connections and whether each is connected</caption>
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className={`${CELL} font-normal`}>Connection</th>
              <th scope="col" className={`${CELL} font-normal`}>What it does</th>
              <th scope="col" className="py-2 align-top font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((row) => {
              const phrase = keyPhrase(row);
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <th scope="row" className={`${CELL} font-medium`}>
                    {row.label}
                    {row.paid && <span className="ml-1.5"><Tag tone="neutral">paid</Tag></span>}
                  </th>
                  <td className={`${CELL} text-ink-muted`}>{keyPurpose(row.id)}</td>
                  <td className="py-2 align-top">
                    <Tag tone={phrase.tone}>{phrase.text}</Tag>
                    {phrase.note && <p className="mt-1 text-xs text-ink">{phrase.note}</p>}
                    {phrase.text !== "Connected" && (
                      <div className="mt-1"><Setup row={row} /></div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}
```

`SchedulesCard.tsx`: the section gets `purpose={SETTINGS_PURPOSE.schedules}`; the "Next run" cell for an off schedule becomes `<span className="text-ink-muted">Off</span>`; after the table add

```tsx
      <TechnicalDetails id="schedule-settings" topic="how to turn a schedule on or off">
        <p>Set the setting to <code className="font-mono">off</code> in <code className="font-mono">.env</code> to stop a schedule, remove it to start it, then restart Harbour:</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {schedules.map((row) => (
            <li key={row.id}>{row.label}: <code className="font-mono">{row.setting}</code></li>
          ))}
        </ul>
      </TechnicalDetails>
```

`SettingsOverview.tsx` already passes `anchor: "keys"` for the connections card; keep the anchor (links to `/settings#keys` exist in Today's cost notice).

- [ ] **Step 5: Update the e2e assertions**

`tests/e2e/settings.spec.ts`: the schedule test expects `Off` in the status cell and nothing about setting names; add `await page.getByText(/Technical details \(how to turn a schedule on or off\)/).click(); await expect(page.getByText("HARBOUR_SCHEDULED_SCANS")).toBeVisible();` and keep the row labels (`Daily check`, `Weekly report`, `Monthly research refresh`, `Nightly backup`). The API-keys test becomes "Connections show status only, never a value": `getByRole("table", { name: "Connections and whether each is connected" })`, statuses `Connected` (Claude token), `Not connected yet` (PageSpeed Insights), `Not available yet` (DataForSEO); keep the two `FAKE_TOKEN` assertions. Any `settingsRegion(page, "API keys")` becomes `"Connections"`.

- [ ] **Step 6: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run lib components && pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): Settings connections read Connected or Not connected yet" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Agents page in plain words

**Files:**
- Create: `lib/explain/agents.ts`, `components/agents/RunLog.tsx`
- Create (tests): `lib/explain/agents.test.ts`
- Modify: `app/(app)/agents/page.tsx`, `app/(app)/agents/[id]/page.tsx`, `components/agents/RunPanel.tsx`, `WeeklyAnalystPanel.tsx`, `ResearchRefreshPanel.tsx`, `JobList.tsx`, `RunActivity.tsx`, `RecoveryBanner.tsx`, `BrainSyncBanner.tsx`, `lib/agents/view.ts`, `lib/analyst/panel-view.ts`, `lib/agents/refresh-view.ts`, `components/design/AgentExamples.tsx` (callers)
- Modify (tests): the matching `*.test.ts(x)` files, `tests/e2e/agents.spec.ts`, `tests/e2e/settings.spec.ts`

**Interfaces:**
- Produces: `AGENTS_INTRO: string`, `AGENT_PURPOSE: Record<"research" | "ideas" | "weekly" | "refresh" | "recent", string>`, `JOB_STATUS_PHRASE: Record<JobStatus, string>`, `RUN_HEADLINE: Record<JobStatus, string>`, `RUN_FAILED_LINE: string`, `RUN_LOG_TOPIC: string`.
- Consumes: `CLAUDE_OFF`, `CLAUDE_OFF_HERE`, `CLAUDE_CONNECT_STEPS` (Task 3), `TechnicalDetails`, `EmptyState`.

- [ ] **Step 1: Write the failing tests**

`lib/explain/agents.test.ts`:

```ts
import type { JobStatus } from "@/lib/jobs/queue";
import {
  AGENT_PURPOSE,
  AGENTS_INTRO,
  JOB_STATUS_PHRASE,
  RUN_FAILED_LINE,
  RUN_HEADLINE,
} from "./agents";

const STATUSES: JobStatus[] = ["queued", "running", "ok", "failed", "cancelled"];

describe("Agents words", () => {
  it("never shows a raw job status", () => {
    for (const status of STATUSES) {
      expect(JOB_STATUS_PHRASE[status]).not.toBe(status);
      expect(RUN_HEADLINE[status].length).toBeGreaterThan(3);
    }
  });

  it("says what to do when a run didn't finish", () => {
    expect(RUN_FAILED_LINE).toMatch(/start it again/);
  });

  it("keeps every line short and free of setting names", () => {
    for (const line of [AGENTS_INTRO, ...Object.values(AGENT_PURPOSE)]) {
      expect(line.length).toBeLessThanOrEqual(120);
      expect(line).not.toMatch(/HARBOUR_|\.env/);
    }
  });
});
```

Component tests (add to the existing files; each uses the real production components):

`components/agents/RunActivity.test.tsx`:

```tsx
  it("says a failed run didn't finish and tucks the raw error and the log under Technical details", () => {
    const { container } = render(
      <RunActivity
        job={{ ...JOB, status: "failed", error: "spawn claude ENOENT" }}
        events={[{ id: 1, kind: "error", text: "spawn claude ENOENT", at: AT }]}
      />,
    );
    expect(screen.getByText("Didn't finish")).toBeInTheDocument();
    expect(screen.getByText(RUN_FAILED_LINE)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toContain("ENOENT");
    expect(screen.getByText(/Technical details \(step-by-step log of the run\)/)).toBeInTheDocument();
  });

  it("still tells the owner what to do when a failed run has no error text", () => {
    render(<RunActivity job={{ ...JOB, status: "failed", error: null }} events={[]} />);
    expect(screen.getByText(RUN_FAILED_LINE)).toBeInTheDocument();
  });

  it("offers Stop this run while it is active", () => {
    render(<RunActivity job={{ ...JOB, status: "running" }} events={[]} />);
    expect(screen.getByRole("button", { name: "Stop this run" })).toBeInTheDocument();
  });
```

(`JOB`, `AT` are the fixtures already in that test file; `run-log` events stay in the DOM inside the closed `<details>` so `getByRole("list", { name: "Run activity" })` still finds them once opened; jsdom renders closed details content, so existing log assertions keep working.)

`components/agents/JobList.test.tsx`:

```tsx
  it("shows a plain status word, never ok or failed", () => {
    render(<JobList jobs={[job(2, "2026-W40")]} products={[]} timeZone="Europe/London" locale="en-GB" />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText("ok")).toBeNull();
  });

  it("explains an empty list", () => {
    render(<JobList jobs={[]} products={[]} timeZone="Europe/London" locale="en-GB" />);
    expect(screen.getByText(/appears here as soon as you start one/)).toBeInTheDocument();
  });
```

`components/agents/RunPanel.test.tsx`:

```tsx
  it("explains in plain words that Claude isn't connected, with the steps under Technical details", () => {
    const { container } = render(<RunPanel products={PRODUCTS} tokenSet={false} />);
    expect(screen.getByText(CLAUDE_OFF)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+|setup-token/);
    expect(screen.getByRole("button", { name: "Find ideas for Acme Docs" })).toBeDisabled();
  });
```

`lib/agents/view.test.ts`: `jobLabel` expectations: discovery `Find ideas: Acme Docs`, scan `Check: Acme Docs`, refresh research `Update: Glossary`, retention `Tidy old data: 2026-10-02`.

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/agents.test.ts components/agents lib/agents lib/analyst`
Expected: FAIL.

- [ ] **Step 3: Implement the words**

`lib/explain/agents.ts`:

```ts
import type { JobStatus } from "@/lib/jobs/queue";

export const AGENTS_INTRO = "Claude's background work, saved to your Second Brain. One job runs at a time.";

export const AGENT_PURPOSE = {
  research: "Claude reads up on a topic and writes it into your Second Brain.",
  ideas: "Claude suggests keywords and questions worth tracking for each site.",
  weekly: "Every Sunday Claude writes a short report on how your sites are doing.",
  refresh: "Claude re-reads research notes that have gone out of date.",
  recent: "What Claude and Harbour have run lately.",
} as const;

/** The status column in the run list. */
export const JOB_STATUS_PHRASE: Readonly<Record<JobStatus, string>> = {
  queued: "Waiting",
  running: "Running",
  ok: "Done",
  failed: "Didn't finish",
  cancelled: "Stopped",
};

/** The headline on a run's own page. */
export const RUN_HEADLINE: Readonly<Record<JobStatus, string>> = {
  queued: "Waiting for its turn",
  running: "Running now",
  ok: "Done",
  failed: "Didn't finish",
  cancelled: "Stopped",
};

export const RUN_FAILED_LINE = "This run didn't finish. You can start it again from the Agents page.";

/** Names the log's Technical details for screen readers. */
export const RUN_LOG_TOPIC = "step-by-step log of the run";
```

`lib/agents/view.ts` `jobLabel`: refresh mode `Update: ${title}`; discovery `Find ideas: ${name}`; scan `Check: ${name}`; retention `Tidy old data: ${day}`; brain push `Sync Second Brain to GitHub`. `lib/analyst/panel-view.ts` `scheduleLine`: off `The weekly report only runs when you ask for it.`; no token `The weekly report is paused until Claude is connected.`; active ``This week's report is ${active === "running" ? "being written now" : "waiting to start"}.``; pending ``Last week's report (${pending.week}) is due. Harbour starts it shortly, if a site was checked in the last 7 days.``; next ``Next report: ${formatWeekdayTime(...)}``. `lib/agents/refresh-view.ts`: off `Research is only updated when you ask.`; no token `Research updates are paused until Claude is connected.`; next ``Next research update: …``. Update `panel-view.test.ts` and `refresh-view.test.ts` to these sentences.

- [ ] **Step 4: Implement the components**

`RunPanel.tsx`: replace `TokenNotice` with

```tsx
function ClaudeNotice() {
  return (
    <div role="note" className="flex flex-col gap-2 rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink">
      <p>{CLAUDE_OFF}</p>
      <TechnicalDetails id="claude-setup" topic="how to connect Claude">
        <ol className="list-decimal pl-4">
          {CLAUDE_CONNECT_STEPS.map((step) => (<li key={step}>{step}</li>))}
        </ol>
      </TechnicalDetails>
    </div>
  );
}
```

Panels open with `<p className="text-sm text-ink-muted">{AGENT_PURPOSE.research}</p>` and `AGENT_PURPOSE.ideas`; headings `Research` and `Find ideas` (was Discovery); buttons: `Run all research` (was `Run all research topics`), per-topic `Run` with `aria-label="Run research: {title}"` (unchanged), per-product `Find ideas` with `aria-label={`Find ideas for ${product.name}`}`; the queued notice ``Started ${n} research ${n === 1 ? "run" : "runs"}``; errors `Couldn't start that run. Try again.` and `Nothing was started. Try again.`.

`WeeklyAnalystPanel.tsx`: purpose line `AGENT_PURPOSE.weekly`; button `Write this week's report now`; disabled reason `CLAUDE_OFF_HERE`; empty `No report yet. The first one arrives on Sunday, or write one now.`; error `Couldn't start the report. Try again.`; the link `Latest report: {week}` stays.

`ResearchRefreshPanel.tsx`: heading `Research refresh` (kept); purpose line `AGENT_PURPOSE.refresh`; button `Update old research`; `whyDisabled` returns `CLAUDE_OFF_HERE` or `Nothing is out of date.`; `queuedNotice`: `Everything out of date is already waiting` / `Nothing is out of date` / ``Started ${n} ${n === 1 ? "update" : "updates"}``; summary line ``${dueCount} of ${view.total} research notes ${dueCount === 1 ? "is" : "are"} out of date``; the missing line ``${view.missing} not written yet: run the research above``; the footer `Each update re-reads up to 3 notes, oldest first. A note counts as old after 30 days.`; error `Couldn't start the update. Try again.`.

`JobList.tsx`: the status cell `<Tag tone={TONE[job.status]}>{JOB_STATUS_PHRASE[job.status]}</Tag>`; the empty state

```tsx
  if (jobs.length === 0) {
    return <EmptyState what="No runs yet." when="Your first run appears here as soon as you start one." why="Use the buttons above." />;
  }
```

the given-up note `Claude's ideas from this run weren't saved. Run it again.`; the table `aria-label="Recent runs"`.

`app/(app)/agents/page.tsx`: the header line becomes `{AGENTS_INTRO}`; `Recent runs` section gets `<p className="text-sm text-ink-muted">{AGENT_PURPOSE.recent}</p>`.

`RunLog.tsx` (new, keeps `RunActivity` under 200 lines):

```tsx
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { RUN_LOG_TOPIC } from "@/lib/explain/agents";
import type { EventKind } from "@/lib/jobs/queue";
import type { RunEvent } from "./run-types";

const EVENT_TONE: Record<EventKind, string> = {
  error: "text-bad", tool: "text-ink-muted", status: "text-ink", text: "text-ink",
};

/** The step-by-step log of a run: raw event text, closed until the owner opens it. */
export function RunLog({ events, error }: { events: RunEvent[]; error: string | null }) {
  return (
    <TechnicalDetails id="run-log" topic={RUN_LOG_TOPIC}>
      {error && <p className="mb-2 break-words font-mono text-bad">{error}</p>}
      {events.length === 0 ? (
        <p className="text-ink-muted">No activity yet.</p>
      ) : (
        <ol aria-label="Run activity" className="flex flex-col gap-1 font-mono">
          {events.map((event) => (<li key={event.id} className={EVENT_TONE[event.kind]}>{event.text}</li>))}
        </ol>
      )}
    </TechnicalDetails>
  );
}
```

`RunActivity.tsx`: delete `EVENT_TONE` and `STATUS_TEXT`; the headline `{RUN_HEADLINE[job.status]}{cancelState === "requested" && active && " — stopping…"}`; the button `Stop this run`; the failed block

```tsx
      {job.status === "failed" && (
        <div role="alert" className="rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink">
          {RUN_FAILED_LINE}
        </div>
      )}
```

then (after the `cancelState`/`lostConnection` lines, unchanged apart from `Couldn't stop it. Try again.`) `<RunLog events={events} error={job.status === "failed" ? job.error : null} />`.

`RecoveryBanner.tsx`: the line becomes `{runs} was interrupted. Harbour is putting your notes back in order, so saving is paused for a moment.` (pluralised: `1 run was` / `N runs were`); `lastError` moves into `<TechnicalDetails id="recovery-error" topic="what Harbour recorded about the interrupted run">`. `BrainSyncBanner.tsx`: `will be saved automatically soon`, `not saved yet — saving resumes once recovery finishes`, `{n} saved {n === 1 ? "change is" : "changes are"} waiting to reach GitHub — Harbour keeps retrying`, buttons `Save now` and `Retry now` (unchanged), errors `Couldn't start saving. Try again.` / `Couldn't start syncing. Try again.` (unchanged). `app/(app)/agents/[id]/page.tsx`: `← Back to agents` stays.

- [ ] **Step 5: Update the e2e assertions**

`tests/e2e/agents.spec.ts`: after navigating to the run, open the log first: `await page.getByText(/Technical details \(step-by-step log of the run\)/).click();` before reading `getByRole("list", { name: "Run activity" })`; `getByRole("button", { name: "Run discovery: Acme Docs" })` becomes `"Find ideas for Acme Docs"`. `tests/e2e/settings.spec.ts`: `Retention: ${today()}` link becomes `Tidy old data: ${today()}`. Grep the other specs for `Run weekly report now`, `Refresh stale research`, `Run all research topics` and `Cancel` and rename to the new button names.

- [ ] **Step 6: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run components lib && pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): plain Agents page, run history and logs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sources and Devices pages, and the sidebar label

**Files:**
- Create: `lib/explain/sources-page.ts`, `lib/explain/sources-page.test.ts`
- Modify: `lib/explain/actions.ts` (+ `thingsWorthDoing`), `lib/explain/briefing.ts`, `components/sources/ConnectionList.tsx`, `ProductSourcesTable.tsx`, `ScheduleCard.tsx`, `SourcesOverview.tsx`, `app/(app)/settings/devices/page.tsx`, `components/settings/DeviceList.tsx`, `AddDeviceButton.tsx`, `components/shell/Sidebar.tsx`
- Modify (tests): `components/sources/SourcesOverview.test.tsx`, `components/settings/DeviceList.test.tsx`, `components/shell/Sidebar.test.tsx`, `lib/explain/actions.test.ts`, `tests/e2e/scans.spec.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `SOURCES_INTRO: string`, `NEXT_CHECK: Record<NextDailyScan, string>`, `checkOutcome(status: "ok" | "partial" | "failed"): string`, `thingsWorthDoing(n: number): string`.
- Consumes: `sourceName`, `sourceExplanation`, `sourceStatusPhrase`, `TechnicalDetails`, `DocsLink`, `NextDailyScan` (type, from `lib/jobs/scan-schedule`).

- [ ] **Step 1: Write the failing tests**

`lib/explain/sources-page.test.ts`:

```ts
import { checkOutcome, NEXT_CHECK, SOURCES_INTRO } from "./sources-page";

describe("Sources page words", () => {
  it("names the outcome of a check in plain words", () => {
    expect(checkOutcome("ok")).toBe("all good");
    expect(checkOutcome("partial")).toBe("some data was missing");
    expect(checkOutcome("failed")).toBe("didn't finish");
  });

  it("describes when the next check is, with no setting names", () => {
    expect(NEXT_CHECK.tomorrow).toBe("Next check: tomorrow at 06:00");
    expect(NEXT_CHECK.off).toBe("Next check: only when you choose Check now");
    for (const line of [SOURCES_INTRO, ...Object.values(NEXT_CHECK)]) expect(line).not.toMatch(/HARBOUR_/);
  });
});
```

Add to `lib/explain/actions.test.ts`:

```ts
  it("counts things worth doing the same way on Today and in the sidebar", () => {
    expect(thingsWorthDoing(1)).toBe("1 thing worth doing");
    expect(thingsWorthDoing(3)).toBe("3 things worth doing");
  });
```

`SourcesOverview.test.tsx` (replace the assertions the new wording breaks; keep the fixtures):

```tsx
  it("reads each connection as Connected or Not connected yet, with steps under Technical details", () => {
    const { container } = render(<SourcesOverview view={view} locale="en-GB" />);
    const list = screen.getByRole("list", { name: "Connections" });
    const speed = within(list).getByText("Google speed test (PageSpeed)").closest("li") as HTMLElement;
    expect(speed).toHaveTextContent("Not connected yet");
    expect(within(speed).getByRole("link", { name: /Connect PageSpeed/ })).toHaveAttribute(
      "href", "https://github.com/rpjonescc/harbour#connect-pagespeed",
    );
    const gsc = within(list).getByText("Google Search Console").closest("li") as HTMLElement;
    expect(gsc).toHaveTextContent("Connected");
    expect(gsc).toHaveTextContent("Fern & Field isn't linked to a Search Console site yet.");
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+/);
  });

  it("says the daily check is on or off without a setting name", () => {
    const { container, rerender } = render(<SourcesOverview view={view} locale="en-GB" />);
    expect(screen.getByText(/Harbour checks every site at 06:00 \(Europe\/London\)/)).toBeInTheDocument();
    rerender(<SourcesOverview view={{ ...view, schedule: { ...view.schedule, enabled: false } }} locale="en-GB" />);
    expect(screen.getByText(/Daily checks are off/)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_SCHEDULED/);
  });

  it("gives each product's check times and each source's status, raw reasons under Technical details", () => {
    render(<SourcesOverview view={view} locale="en-GB" />);
    const acme = screen.getByRole("region", { name: "Acme Docs" });
    expect(acme).toHaveTextContent("Last check 1 Oct 2026, 06:04 (some data was missing) · Next check: tomorrow at 06:00");
    const row = within(acme).getByRole("row", { name: /Google Search Console/ });
    expect(row).toHaveTextContent("Google didn't send the data in the last check");
    expect(within(row).getByText(/Technical details \(Acme Docs: Google Search Console\)/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Fern & Field" })).toHaveTextContent("Check running now");
  });
```

`DeviceList.test.tsx` (add):

```tsx
  it("gives two devices with the same name different remove buttons", () => {
    const same = [
      { ...DEVICE, id: 1, deviceLabel: "Chrome on Linux", createdAt: new Date("2026-09-01T10:00:00Z") },
      { ...DEVICE, id: 2, deviceLabel: "Chrome on Linux", createdAt: new Date("2026-09-15T10:00:00Z") },
    ];
    render(<DeviceList devices={same} timeZone="Europe/London" locale="en-GB" />);
    const names = screen.getAllByRole("button", { name: /^Remove Chrome on Linux/ }).map((b) => b.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(2);
  });

  it("says 'not used yet' instead of 'never'", () => {
    render(<DeviceList devices={[{ ...DEVICE, lastUsedAt: null }]} timeZone="Europe/London" locale="en-GB" />);
    expect(screen.getByText(/not used yet/)).toBeInTheDocument();
    expect(screen.queryByText(/never/)).toBeNull();
  });
```

(`DEVICE` is the existing `DeviceSummary` fixture in that file; add one if the file builds devices inline.)

`Sidebar.test.tsx`: `"3 open actions"` becomes `"3 things worth doing"` and `"1 open action"` becomes `"1 thing worth doing"`.

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain components/sources components/settings components/shell`
Expected: FAIL.

- [ ] **Step 3: Implement the words**

`lib/explain/sources-page.ts`:

```ts
import type { NextDailyScan } from "@/lib/jobs/scan-schedule";

export const SOURCES_INTRO = "Where each score's data comes from, and whether it's working.";

/** When a product's next check is. The 06:00 time is the schedule's (README: When things run). */
export const NEXT_CHECK: Readonly<Record<NextDailyScan, string>> = {
  off: "Next check: only when you choose Check now",
  today: "Next check: today at 06:00",
  tomorrow: "Next check: tomorrow at 06:00",
  due: "Next check: starting shortly",
};

const OUTCOME = { ok: "all good", partial: "some data was missing", failed: "didn't finish" } as const;

/** How a finished check ended, in words. */
export function checkOutcome(status: keyof typeof OUTCOME): string {
  return OUTCOME[status];
}
```

`lib/explain/actions.ts`: add

```ts
/** "3 things worth doing": Today's sub-line and the sidebar badge say it the same way. */
export function thingsWorthDoing(n: number): string {
  return `${n} ${n === 1 ? "thing" : "things"} worth doing`;
}
```

and in `briefing.ts` `subLine` use `n === 0 ? "Nothing on the to-do list" : thingsWorthDoing(n)`.

- [ ] **Step 4: Implement the components**

`ConnectionList.tsx` (full rewrite of `rows` and the list; the four collector ids):

```tsx
const IDS = ["crawler", "readiness", "pagespeed", "search-console"] as const;

type Row = { id: (typeof IDS)[number]; connected: boolean; note: string };

function rows(view: SourcesView): Row[] {
  const { connections } = view;
  const unlinked = view.products.filter((p) => !connections.searchConsoleProducts[p.productId]);
  const linkedAny = connections.searchConsoleCredentials && unlinked.length < view.products.length;
  const gscNote = !connections.searchConsoleCredentials
    ? sourceExplanation("search-console").gives
    : unlinked.length > 0
      ? `${unlinked.map((p) => p.name).join(" and ")} ${unlinked.length === 1 ? "isn't" : "aren't"} linked to a Search Console site yet.`
      : "Every site is linked.";
  return [
    { id: "crawler", connected: true, note: sourceExplanation("crawler").gives },
    { id: "readiness", connected: true, note: sourceExplanation("readiness").gives },
    { id: "pagespeed", connected: connections.pagespeed, note: sourceExplanation("pagespeed").gives },
    { id: "search-console", connected: linkedAny, note: gscNote },
  ];
}

const DOCS: Partial<Record<Row["id"], { href: string; label: string }>> = {
  pagespeed: { href: DOCS_LINKS.pagespeed, label: "Connect PageSpeed" },
  "search-console": { href: DOCS_LINKS.searchConsole, label: "Connect Search Console" },
};

/** Which data sources are connected, as set up on the Harbour machine. Never shows a secret. */
export function ConnectionList({ view }: { view: SourcesView }) {
  return (
    <Panel className="px-4">
      <ul aria-label="Connections" className="divide-y divide-line">
        {rows(view).map((row) => {
          const docs = DOCS[row.id];
          return (
            <li key={row.id} className="flex flex-col gap-1 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{sourceName(row.id)}</span>
                <Tag tone={row.connected ? "accent" : "neutral"}>
                  {sourceStatusPhrase(row.id, row.connected ? "ok" : "not_configured")}
                </Tag>
              </p>
              <p className="text-xs text-ink-muted">{row.note}</p>
              {!row.connected && (
                <TechnicalDetails id={`connect-${row.id}`} topic={`how to connect ${sourceName(row.id)}`}>
                  <ol className="list-decimal pl-4">
                    {sourceExplanation(row.id).connect.map((step) => (<li key={step}>{step}</li>))}
                  </ol>
                  {docs && <DocsLink href={docs.href}>{docs.label}</DocsLink>}
                </TechnicalDetails>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
```

(`sourceStatusPhrase("crawler", "ok")` is "Working", matching the built-in sources; the "Connect X" docs link is outside the details when the owner wants it quickly: render it as a sibling `<DocsLink>` below the details if the e2e keyboard path requires it; the test above looks it up inside the row either way.)

`ScheduleCard.tsx`:

```tsx
export function ScheduleCard({ enabled, timeZone }: { enabled: boolean; timeZone: string }) {
  return (
    <Panel className="flex flex-col gap-1 p-4">
      <h2 className="flex items-center gap-2 font-serif text-lg">
        Daily check <Tag tone={enabled ? "accent" : "neutral"}>{enabled ? "On" : "Off"}</Tag>
      </h2>
      <p className="text-sm text-ink-muted">
        {enabled
          ? `Harbour checks every site at 06:00 (${timeZone}), and catches up when it starts.`
          : "Daily checks are off, so Harbour only checks when you choose Check now."}{" "}
        <DocsLink href={DOCS_LINKS.schedule}>When checks run</DocsLink>
      </p>
      {!enabled && (
        <TechnicalDetails id="daily-check-setting" topic="how to turn daily checks back on">
          <p>Remove <code className="font-mono">HARBOUR_SCHEDULED_SCANS=off</code> from <code className="font-mono">.env</code>, then restart the worker.</p>
        </TechnicalDetails>
      )}
    </Panel>
  );
}
```

`ProductSourcesTable.tsx`: delete `STATUS` and `NEXT`; the line under the heading

```tsx
        {active
          ? `Check ${active.status === "running" ? "running" : "queued"} now`
          : lastScan
            ? `Last check ${at(lastScan.finishedAt ?? lastScan.startedAt)} (${checkOutcome(lastScan.status)})`
            : "Never checked"}{" "}
        · {NEXT_CHECK[product.next]}
```

columns `Source`, `Status`, `Last checked`, `More`; the row: name `sourceName(run.collector)`, status cell `{run.status ? sourceStatusPhrase(run.collector, run.status) : "Hasn't run yet"}` (plain text; add a `Tag` only for failed: `<Tag tone="warn">`), the last cell

```tsx
                <td className="py-2 text-xs text-ink-muted">
                  {run.error && (
                    <TechnicalDetails
                      id={`source-${product.productId}-${run.collector}`}
                      topic={`${product.name}: ${sourceName(run.collector)}`}
                    >
                      <p className="break-words">{run.error}</p>
                    </TechnicalDetails>
                  )}
                </td>
```

`SourcesOverview.tsx`: the header line is `{SOURCES_INTRO}`. `lastScan.status` is `"ok" | "partial" | "failed"`.

`app/(app)/settings/devices/page.tsx`: line becomes `The devices that can open Harbour as {session.login}. Each signs in with a passkey: your fingerprint, face or screen lock.` (one line; the login is the owner's own, shown to them). `DeviceList.tsx`: `fmt` returns `"not used yet"` for a null date (and the text reads `Added {date} · last used {date}` / `Added {date} · not used yet`: write it as `{lastUsedAt ? `last used ${fmt(...)}` : "not used yet"}`); the button `aria-label={`Remove ${device.deviceLabel}, added ${fmt(device.createdAt, timeZone, locale)}`}` with visible text `Remove`; confirm text ``Remove “${label}” from Harbour? That device won't be able to sign in any more.${warning}`` where `warning` is ` You will be signed out on this device.`; error `Couldn't remove that device. Try again.`. `AddDeviceButton.tsx`: unchanged except the hint `Open this on the new device within 15 minutes. It only works once.`

`Sidebar.tsx`: `label: thingsWorthDoing(openActions)`.

- [ ] **Step 5: Update the e2e assertions**

`tests/e2e/scans.spec.ts`: the Sources test (`Last check .+ \(ok\)`) becomes `/Last check .+ \(all good\)/` (or `some data was missing` if the fixture ends partial; read the fixture) and the schedule text `/HARBOUR_SCHEDULED_SCANS=off/` becomes `/Daily checks are off/`; connection names `Crawler`, `Readiness`, `PageSpeed`, `Search Console` become `Page check`, `Site setup check`, `Google speed test (PageSpeed)`, `Google Search Console` wherever the spec reads them. `tests/e2e/shell.spec.ts`: any `open actions` label becomes `things worth doing`.

- [ ] **Step 6: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run && pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): plain Sources and Devices pages, sidebar says things worth doing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Consistency leftovers

**Files:**
- Modify: `components/ui/Tag.tsx`, `components/products/SubScoreRow.tsx`, `lib/explain/actions.ts` (+ `impactTone`), `components/actions/ActionCard.tsx`, `components/today/ActionCard.tsx`, `components/today/WorthDoingNext.tsx`, `lib/actions/views.ts` (`RuleActionStatus`), `components/products/IssueItem.tsx`, `components/design/TodayExamples.tsx`, `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§5.1), `README.md` (the "Worth doing next" sentence)
- Create (tests): `components/explain/verdict-tone.test.tsx`
- Modify (tests): `lib/actions/views.test.ts`, `components/products/IssueItem.test.tsx`, `components/products/IssueList.test.tsx`, `components/products/ProductOverview.test.tsx`, `components/today/TodayView.test.tsx`, `lib/explain/areas.test.ts`, `lib/explain/actions.test.ts`, `tests/e2e/shell.spec.ts`, `tests/e2e/actions.spec.ts`, `tests/e2e/scans.spec.ts`

**Interfaces:**
- Produces: `Tag` tone `"good"`; `impactTone(impact: Impact): "warn" | "neutral"`; `RuleActionStatus = Pick<ActionRow, "id" | "status" | "snoozedUntil"> & { who: WhoOnIt | null }`.
- Consumes: `whoIsOnIt`, `lastStatusActor`, `eventsByAction` (private in `lib/actions/views.ts`, used inside it), `WHO_PHRASE`, `STATUS_COLUMN`, `EFFORT_PHRASE`.

- [ ] **Step 1: Write the failing tests**

`components/explain/verdict-tone.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { VerdictLine } from "./VerdictLine";
import { SubScoreRow } from "../products/SubScoreRow";

const entry = (score: number): ScoreBreakdownEntry => ({
  key: "seo.technicalHealth", label: "Technical health", score, weight: 0.3, status: "ok",
  evidence: "3 of 3 pages answer with a success status.",
});
const family = (className: string) =>
  /text-good/.test(className) ? "good" : /bg-warn-soft|text-warn/.test(className) ? "warn" : "neutral";

describe("verdict colours", () => {
  it.each([
    [90, "Strong", "good"],
    [75, "Good", "good"],
    [60, "Fair", "neutral"],
    [30, "Needs work", "warn"],
  ])("a score of %d (%s) is %s in the verdict line and in the sub-score chip", (score, label, tone) => {
    const { unmount } = render(<VerdictLine area="seo" score={score} />);
    expect(family(screen.getByText(label).className)).toBe(tone);
    unmount();
    render(<SubScoreRow entry={entry(score)} />);
    expect(family(screen.getByText(label).className)).toBe(tone);
  });
});
```

(Fair: the verdict line uses `text-ink` and the chip `text-ink-muted`; `family` maps both to "neutral".)

`lib/actions/views.test.ts`: change the `ruleActionStatuses` expectation to include `who`, and add:

```ts
    expect(ruleActionStatuses(db, "acme-docs")).toEqual(
      new Map([
        ["missing-title", { id: open, status: "open", snoozedUntil: null, who: "you" }],
        ["thin-content", { id: snoozed, status: "snoozed", snoozedUntil: "2026-10-09", who: null }],
      ]),
    );

  it("says who is on an in-progress rule action: Claude, a pull request, or the owner", () => {
    const db = openTestDb();
    const byClaude = insertAction(db, ruleAction({ ruleKey: "a-rule", status: "in_progress" }), "claude", null, at(1));
    const byOwner = add(db, { status: "open" }, "b-rule");
    setStatus(db, byOwner, "open", "in_progress", { actor: "owner", now: at(2) });
    const withPr = add(db, { status: "open" }, "c-rule");
    setStatus(db, withPr, "open", "in_progress", { actor: "claude", now: at(3) });
    linkPullRequest(db, { id: withPr, url: "https://github.com/example/site/pull/7", productIds: PRODUCTS, now: at(4) });
    const who = (key: string) => ruleActionStatuses(db, "acme-docs").get(key)?.who;
    expect(byClaude).toBeGreaterThan(0);
    expect(who("a-rule")).toBe("claude");
    expect(who("b-rule")).toBe("you");
    expect(who("c-rule")).toBe("pr_waiting");
  });
```

`IssueItem.test.tsx`: the `renderIssue` action becomes `{ id: 5, status: "in_progress", snoozedUntil: null, who: "claude" }`; replace the first test:

```tsx
  it("leads with two chips (size of win, who's on it), the title and why; effort is a quiet line", () => {
    renderIssue();
    const card = screen.getByRole("article", { name: "1 page you link to can't be found" });
    expect(within(card).getByText("Big win")).toBeInTheDocument();
    expect(within(card).getByText("Claude is on it")).toBeInTheDocument();
    expect(within(card).getByText("an afternoon · In progress")).toBeInTheDocument();
    expect(within(card).getByText(issue.problem)).toBeInTheDocument();
    expect(within(card).queryByText("SEO")).toBeNull();
  });

  it("shows the status phrase when nobody is on it, and the same wording as the board", () => {
    const { rerender } = renderWith({ id: 5, status: "open", snoozedUntil: null, who: "you" });
    expect(screen.getByText("Waiting for you")).toBeInTheDocument();
    rerender(<IssueItem issue={issue} action={{ id: 5, status: "done", snoozedUntil: null, who: null }} product={product} locale="en-GB" />);
    expect(screen.getByText("Done — still found in the last check")).toBeInTheDocument();
    rerender(<IssueItem issue={issue} action={null} product={product} locale="en-GB" />);
    expect(screen.getByText("Tracking starts with the next check")).toBeInTheDocument();
  });
```

(`renderWith(action)` is `render(<IssueItem issue={issue} action={action} product={product} locale="en-GB" />)`; define it next to `renderIssue`. Update the other `RuleActionStatus` literals in `IssueList.test.tsx` and `ProductOverview.test.tsx` with `who`.)

`lib/explain/actions.test.ts`:

```ts
  it("tones the size of a win once for every surface", () => {
    expect(impactTone("high")).toBe("warn");
    expect(impactTone("medium")).toBe("neutral");
    expect(impactTone("low")).toBe("neutral");
  });
```

`TodayView.test.tsx`: `{ name: "Worth doing next" }` becomes `{ name: "Next up" }`; and a card test: the Big win tag on a Today card has the same classes as on a board card (`bg-warn-soft`). `lib/explain/areas.test.ts:56`: `/Worth doing next/` becomes `/Next up/`.

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run components lib/actions lib/explain`
Expected: FAIL.

- [ ] **Step 3: Implement**

`Tag.tsx`: add `good: "bg-surface-sunk text-good"` to `TONES` and `"good"` to `Tone`. `SubScoreRow.tsx`: `TAG_TONE` becomes `{ strong: "good", good: "good", fair: "neutral", weak: "warn", gap: "neutral" }` typed `Record<VerdictTone, "good" | "warn" | "neutral">`.

`lib/explain/actions.ts`:

```ts
/** The size of a win's chip tone: one answer for the board, Today and the issue cards. */
export function impactTone(impact: Impact): "warn" | "neutral" {
  return impact === "high" ? "warn" : "neutral";
}
```

Use it in `components/actions/ActionCard.tsx` (`tone={impactTone(action.impact)}`), `components/today/ActionCard.tsx` (was `accent` for high) and `IssueItem.tsx`.

`lib/actions/views.ts`:

```ts
/** Where a rule's action stands, for the product page's issues, and who is on it. */
export type RuleActionStatus = Pick<ActionRow, "id" | "status" | "snoozedUntil"> & {
  who: WhoOnIt | null;
};

/** ruleKey → { id, status, snoozedUntil, who } for one product's rule actions. */
export function ruleActionStatuses(db: Db, productId: string): Map<string, RuleActionStatus> {
  const rows = db
    .select({
      ruleKey: actions.ruleKey, id: actions.id, status: actions.status,
      snoozedUntil: actions.snoozedUntil, prUrl: actions.prUrl,
    })
    .from(actions)
    .where(and(eq(actions.productId, productId), eq(actions.source, "rule")))
    .all();
  // A product has at most a handful of rules, so reading each one's history is cheap.
  const events = eventsByAction(db, rows.map((row) => row.id));
  return new Map(
    rows.flatMap(({ ruleKey, prUrl, ...rest }) =>
      ruleKey === null
        ? []
        : [[ruleKey, {
            ...rest,
            who: whoIsOnIt({ status: rest.status, prUrl, statusActor: lastStatusActor(events.get(rest.id) ?? []) }),
          }] as const],
    ),
  );
}
```

`IssueItem.tsx` (replace the chips and add the quiet line; keep the Technical details block as is):

```tsx
function statusText(action: RuleActionStatus | null, locale: string): string {
  if (action?.who) return WHO_PHRASE[action.who];
  return actionStatusText(action, locale);
}
...
      <div className="flex flex-wrap gap-1.5">
        <Tag tone={impactTone(issue.impact)}>{IMPACT_PHRASE[issue.impact]}</Tag>
        <Tag tone={action?.who ? "accent" : action?.status === "done" ? "warn" : "neutral"}>
          {statusText(action, locale)}
        </Tag>
      </div>
      <h3 id={headingId} className="text-base font-medium text-ink">{issue.title}</h3>
      <p className="text-sm text-ink-muted">{issue.problem}</p>
      <p className="text-xs text-ink-muted">
        {EFFORT_PHRASE[issue.effort]}
        {action?.status === "in_progress" && action.who && ` · ${STATUS_COLUMN.in_progress}`}
      </p>
```

`WorthDoingNext.tsx`: the heading text `Next up` (and its `aria` name). `TodayExamples.tsx`: label `Next up · …`. Spec §5.1 item 4: `**Next up:** the top 3 actions…` with an "As built" line: "The heading is Next up, so a 'Worth doing' card (medium impact, §3) doesn't sit under a 'Worth doing next' heading." README line 588: `**Worth doing next**` becomes `**Next up**`. e2e: `shell.spec.ts:141`, `actions.spec.ts:204`, `scans.spec.ts:206` heading and region name `Worth doing next` becomes `Next up`.

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): one verdict colour, who's on it on issue cards, Next up heading" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scoring v2, part 1: product kind and the freshness-only formula

**Files:**
- Modify: `lib/products/config.ts`, `lib/products/catalog.ts`, `lib/scan/types.ts` (`ScoreContext`), `lib/scan/scoring/inputs.ts`, `lib/scan/scoring/aeo.ts`, `lib/scan/score.ts`, `lib/scan/store.ts` (`scoreContext`), `lib/scan/run-scan.ts`, `lib/explain/subscores/aeo.ts`, `harbour.config.example.json`, `README.md`
- Modify (fixtures and tests): `tests/helpers/scoring.ts` (`CONTEXT`), `tests/e2e/seed-actions.ts`, every `Product` fixture typecheck flags, `lib/products/config.test.ts`, `lib/scan/scoring/sub-scores.test.ts`, `lib/scan/score.test.ts`, `lib/explain/subscores/aeo.test.ts`

**Interfaces:**
- Produces: `PRODUCT_KINDS: readonly ["news", "product"]`, `type ProductKind` (from `lib/products/config.ts`, re-exported by `catalog.ts`); `Product.kind: ProductKind`; `ScoreContext.productKind: ProductKind`; `ScoringInputs.productKind: ProductKind`; `preferredSources(readiness: Readiness, kind: ProductKind): SubScore`; `scoreContext(db, product: Pick<Product, "id" | "kind">, statuses, now): ScoreContext`; `FORMULA_VERSION = "v2"`.
- Consumes: existing `measured`, `missing`, `plural`, `withSources`.

- [ ] **Step 1: Write the failing tests**

`lib/products/config.test.ts` (add; `BASE` is a valid product `{ id, name, url, hue }`):

```ts
describe("product kind", () => {
  const base = { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" };

  it("defaults to product, so a config with no kind scores as a product site", () => {
    expect(parseProductConfig({ products: [base] }).products[0]?.kind).toBe("product");
  });

  it("accepts news", () => {
    const parsed = parseProductConfig({ products: [{ ...base, kind: "news" }] });
    expect(parsed.products[0]?.kind).toBe("news");
  });

  it("refuses anything else with a message naming the allowed values", () => {
    expect(() => parseProductConfig({ products: [{ ...base, kind: "blog" }] })).toThrow(
      /kind must be one of: news, product/,
    );
  });
});
```

`lib/scan/scoring/sub-scores.test.ts`: change the existing `preferredSources(...)` calls to pass `"news"` (the v1 behaviour, unchanged), and add:

```ts
describe("preferredSources by kind (formula v2)", () => {
  const ready = (button: boolean, freshContent: boolean) =>
    readinessOf({
      preferredSources: {
        button,
        buttonPages: button ? ["https://docs.example.com/"] : [],
        freshUrls: freshContent ? 3 : 2,
        freshContent,
      },
    });

  it("scores a product site on freshness alone: the button adds nothing", () => {
    expect(preferredSources(ready(true, false), "product")).toMatchObject({
      score: 0,
      evidence: "2 URLs updated in the last 30 days (not enough for fresh content).",
    });
    expect(preferredSources(ready(false, true), "product")).toMatchObject({
      score: 100,
      evidence: "3 URLs updated in the last 30 days (fresh content).",
    });
    expect(preferredSources(ready(true, true), "product").score).toBe(100);
  });

  it("keeps the v1 split for a news site", () => {
    expect(preferredSources(ready(true, false), "news").score).toBe(50);
    expect(preferredSources(ready(false, true), "news").score).toBe(50);
    expect(preferredSources(ready(true, true), "news").score).toBe(100);
  });

  it.each(["news", "product"] as const)("is missing, not zero, when readiness can't read the crawl (%s)", (kind) => {
    const blind = readinessOf({ preferredSources: null });
    expect(preferredSources(blind, kind).score).toBeNull();
  });
});
```

`lib/scan/score.test.ts` (add; helpers from `tests/helpers/scoring`):

```ts
describe("scoring v2", () => {
  const stale = readiness({
    preferredSources: {
      button: true, buttonPages: ["https://docs.example.com/"], freshUrls: 1, freshContent: false,
    },
  });
  const observations = [...ACME_CRAWL, stale, cwv(), ...searchConsole(daysOf(28, 59), daysOf(28, 50))];
  const score = (productKind: "news" | "product") =>
    scoreOf(observations, ALL_OK, { ...CONTEXT, productKind });

  it("is formula v2", () => {
    expect(FORMULA_VERSION).toBe("v2");
    expect(score("product")?.formulaVersion).toBe("v2");
  });

  it("changes only the Preferred Sources sub-score and the AEO total between kinds", () => {
    const news = score("news");
    const product = score("product");
    expect(entryOf(news, "aeo.preferredSources")?.score).toBe(50);
    expect(entryOf(product, "aeo.preferredSources")?.score).toBe(0);
    expect(entryOf(product, "aeo.preferredSources")?.weight).toBe(0.25);
    expect(news?.seo).toBe(product?.seo);
    expect(news?.geo).toBe(product?.geo);
    expect(news?.aeo).toBeGreaterThan(product?.aeo ?? 0);
  });
});
```

(import `FORMULA_VERSION` from `./score`; the existing v1 breakdown expectations in that file become `formulaVersion: "v2"`, and its `aeo.preferredSources` entry for the Acme fixture keeps score 100 because the fixture has 4 fresh URLs and `CONTEXT` is a product site; its evidence becomes `"4 URLs updated in the last 30 days (fresh content)."` and its label `"Fresh content and Preferred Sources"`.)

`lib/explain/subscores/aeo.test.ts`: add a case that the product evidence reads plainly:

```ts
  it("reads the freshness-only evidence of a product site", () => {
    const line = subScoreLine({
      key: "aeo.preferredSources", score: 100,
      evidence: "3 URLs updated in the last 30 days (fresh content).",
    });
    expect(line).toBe("3 pages changed in the last 30 days.");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/products lib/scan lib/explain/subscores`
Expected: FAIL.

- [ ] **Step 3: Implement the config**

`lib/products/config.ts`:

```ts
/** News sites keep Preferred Sources in their AEO score; every other site is a product site. */
export const PRODUCT_KINDS = ["news", "product"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];
```

and in `productSchema`:

```ts
  kind: z
    .enum(PRODUCT_KINDS, { message: `kind must be one of: ${PRODUCT_KINDS.join(", ")}` })
    .default("product"),
```

`catalog.ts`: `export type { Hue, ProductKind } from "./config";` and `Product` gets `/** "news" keeps Preferred Sources in its AEO score; "product" (the default) does not. */ kind: ProductKind;`. Run `source ~/.nvm/nvm.sh && pnpm typecheck` and add `kind: "product"` to every `Product` literal it flags (about thirty test fixtures and `components/design/*-data.ts`).

`harbour.config.example.json`: add `"kind": "product"` to the Acme Docs entry only.

- [ ] **Step 4: Implement the formula**

`lib/scan/types.ts` `ScoreContext`: add

```ts
  /** "news" sites keep Preferred Sources in AEO (formula v1); "product" sites score freshness only. */
  productKind: ProductKind;
```

`inputs.ts`: `ScoringInputs` gets `productKind: ProductKind`; `readInputs` returns `productKind: context.productKind`. `store.ts`:

```ts
export function scoreContext(
  db: Db,
  product: Pick<Product, "id" | "kind">,
  statuses: Readonly<Record<string, CollectorStatus>>,
  now: Date,
): ScoreContext {
  const skipped = statuses.pagespeed === "skipped";
  return {
    now,
    productKind: product.kind,
    previousPagespeed: skipped ? latestOkObservations(db, product.id, "pagespeed") : null,
  };
}
```

`run-scan.ts`: `scoreContext(deps.db, scan.product, statuses, deps.now())`; `tests/e2e/seed-actions.ts`: `scoreContext(db, CAFE, statuses, now)` (`CAFE` has `id` and gets `kind: "product"`); `tests/helpers/scoring.ts`: `CONTEXT = { now: NOW, productKind: "product", previousPagespeed: null }`.

`score.ts`: `FORMULA_VERSION = "v2"` with the comment `/** Bump with any change to a formula, weight or threshold: stored rows keep their version. v2: Preferred Sources only counts for news sites (spec §6). */`; update the `scoreScan` doc comment ("Scoring v2").

`aeo.ts`:

```ts
/**
 * Fresh content: 3+ URLs updated or published in the last 30 days. News sites also get 50 points
 * for a Google Preferred Sources button (formula v1): it is a Top Stories feature, so for any
 * other site the button counts for nothing and fresh content is worth the whole score.
 */
export function preferredSources(readiness: Readiness, kind: ProductKind): SubScore {
  const ready = readiness.preferredSources;
  if (!ready) {
    return missing("Readiness could not read this scan's crawl: Preferred Sources unknown");
  }
  const urls = `${ready.freshUrls} ${plural(ready.freshUrls, "URL")}`;
  const fresh = ready.freshContent ? "fresh content" : "not enough for fresh content";
  const updated = `${urls} updated in the last 30 days (${fresh}).`;
  if (kind === "product") return measured(ready.freshContent ? 100 : 0, updated);
  const score = (ready.button ? BUTTON_POINTS : 0) + (ready.freshContent ? FRESH_POINTS : 0);
  const pages = ready.buttonPages.length;
  const button = ready.button
    ? `Preferred Sources button on ${pages} ${plural(pages, "page")}`
    : "No Preferred Sources button";
  return measured(score, `${button}; ${updated}`);
}
```

and the spec entry: `label: "Fresh content and Preferred Sources"`, `measure: (i) => withSources([i.crawl, i.readiness], (_crawl, r: Readiness) => preferredSources(r, i.productKind))`; update the "AEO sub-scores of formula v1" comment to v2.

`lib/explain/subscores/aeo.ts`: `summarise` for `aeo.preferredSources`: when the evidence starts with neither button phrase, return the plain `changed` sentence:

```ts
function preferredSources(evidence: string): string | null {
  const fresh = numbersIn(evidence, /(?<urls>\d+) URLs? updated in the last 30 days/, ["urls"]);
  if (!fresh) return null;
  const changed = `${fresh.urls} ${plural(fresh.urls, "page")} changed in the last 30 days`;
  if (evidence.startsWith("Preferred Sources button on")) {
    return `There's a Preferred Sources button, and ${changed}.`;
  }
  if (evidence.startsWith("No Preferred Sources button")) {
    return `There's no Preferred Sources button yet, and ${changed}.`;
  }
  return `${changed}.`;
}
```

and its entry: `name: "Fresh pages"`; `what`: "Whether you've published or updated at least three pages in the last 30 days. News sites also get credit for Google's Preferred Sources button, which lets readers choose to see more of you in Google's news results."; `todo`: "Keep publishing or updating pages regularly, even small ones. If you run a news site, add the Preferred Sources button too."; keep `why` and `worth`. Update the explain tests that read the old name.

- [ ] **Step 5: Document**

`README.md` (the product config section near line 384 and the formula section near line 786): add `kind` to the example JSON and a bullet: "`kind` (optional): `"product"` (the default) or `"news"`. Google's Preferred Sources is a Top Stories feature, so it only counts toward a news site's Answer-ready score; for every other site Answer-ready's "Fresh pages" counts fresh content alone. Scoring formula v2 (from this change) is the first to use it; earlier scores are kept as they were." Describe the formula: "Fresh pages: 3 or more URLs updated in the last 30 days score 100 (weight 25 %); news sites add 50 points for a Preferred Sources button (formula v1)." Keep the README accurate where it says the formula is `v1`.

- [ ] **Step 6: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run && pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(scoring): product kind and formula v2, Preferred Sources only scores news sites" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scoring v2, part 2: rule gating, closing old actions and the history note

**Files:**
- Create: `lib/explain/scoring-notes.ts`, `lib/explain/scoring-notes.test.ts`, `components/products/ScoringNote.tsx`, `lib/actions/preferred-sources-gating.test.ts`
- Modify: `lib/scan/rule-def.ts` (`Facts.productKind`), `lib/scan/issue-rules.ts`, `lib/scan/issues.ts` (`evaluateRules`, `deriveIssues`), `lib/scan/worker-deps.ts`, `lib/scan/product-view.ts`, `lib/scan/views.ts` (`formulaChange`), `lib/analyst/export-product.ts`, `app/(app)/products/[id]/page.tsx`, `components/products/ProductHeader.tsx`, `components/products/ProductOverview.tsx`, `tests/e2e/seed-actions.ts`, `tests/helpers/scan-views.ts` (`formulaVersion` option)
- Modify (tests): `lib/scan/issue-rules.test.ts`, `lib/scan/issues.test.ts`, `lib/scan/views.test.ts`, `components/products/ProductOverview.test.tsx`, `lib/analyst/export.test.ts`

**Interfaces:**
- Produces: `Facts.productKind: ProductKind`; `evaluateRules(observations, statuses, kind: ProductKind): RuleOutcome[]`; `deriveIssues(observations, statuses, kind: ProductKind): Issue[]`; `formulaChange(db, productId, now): FormulaChange | null` with `type FormulaChange = { from: string; to: string; at: Date }`; `scoringNote(change: FormulaChange | null): string | null`; `productView(db, product: Pick<Product, "id" | "kind">, now): ProductView` with a new `formulaChange` field; `SeedScan.formulaVersion?: string`.
- Consumes: Task 7's `ProductKind` and `Product.kind`; `planRuleSync`, `syncRuleActions`, `insertAction`.

- [ ] **Step 1: Write the failing tests**

`lib/scan/issues.test.ts` (add; real rules over a crawl whose readiness has no button):

```ts
describe("the no-preferred-sources rule", () => {
  const noButton = readiness({
    preferredSources: { button: false, buttonPages: [], freshUrls: 0, freshContent: false },
  });
  const outcome = (kind: "news" | "product") =>
    evaluateRules([...ACME_CRAWL, noButton], ALL_OK, kind).find((o) => o.ruleId === "no-preferred-sources");

  it("fires for a news site", () => {
    expect(outcome("news")?.state).toBe("present");
  });

  it("never applies to a product site, whatever the page carries", () => {
    expect(outcome("product")?.state).toBe("clear");
  });

  it("stays unknown when readiness didn't run ok, for either kind (a gap, not a resolution)", () => {
    const statuses = { ...ALL_OK, readiness: "failed" as const };
    for (const kind of ["news", "product"] as const) {
      const found = evaluateRules([...ACME_CRAWL, noButton], statuses, kind).find(
        (o) => o.ruleId === "no-preferred-sources",
      );
      expect(found?.state).toBe("unknown");
    }
  });
});
```

(update every other `evaluateRules(...)` and `deriveIssues(...)` call in tests with a third argument `"product"`.)

`lib/actions/preferred-sources-gating.test.ts` (the real path: rules, then `planRuleSync`, then the store):

```ts
import { eq } from "drizzle-orm";
import { actions } from "@/lib/db/schema";
import { evaluateRules } from "@/lib/scan/issues";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { planRuleSync } from "./rule-sync";
import { syncRuleActions } from "./rule-sync-store";
import { insertAction } from "./store";
import type { ActionStatus } from "./types";

const NOW = new Date("2026-10-03T06:00:00Z");
const noButton = readiness({
  preferredSources: { button: false, buttonPages: [], freshUrls: 0, freshContent: false },
});
const outcomes = (kind: "news" | "product") =>
  evaluateRules([...ACME_CRAWL, noButton], ALL_OK, kind);

describe("existing no-preferred-sources actions after the formula change", () => {
  it.each(["open", "in_progress", "snoozed"] as const)(
    "resolves a %s action for a product site through the normal sync",
    (status: ActionStatus) => {
      const db = openTestDb();
      const id = insertAction(
        db,
        ruleAction({ ruleKey: "no-preferred-sources", status, snoozedUntil: status === "snoozed" ? "2026-10-09" : null }),
        "scan", null, new Date("2026-10-01T06:00:00Z"),
      );
      const counts = syncRuleActions(db, { productId: "acme-docs", outcomes: outcomes("product"), scanDate: "2026-10-03", now: NOW });
      expect(counts.resolved).toBeGreaterThanOrEqual(1);
      expect(db.select().from(actions).where(eq(actions.id, id)).get()?.status).toBe("done");
    },
  );

  it("leaves a news site's action open while the rule still fires", () => {
    const db = openTestDb();
    const id = insertAction(db, ruleAction({ ruleKey: "no-preferred-sources" }), "scan", null, NOW);
    syncRuleActions(db, { productId: "acme-docs", outcomes: outcomes("news"), scanDate: "2026-10-03", now: NOW });
    expect(db.select().from(actions).where(eq(actions.id, id)).get()?.status).toBe("open");
  });

  it("only marks a dismissed action as no longer present: it stays dismissed", () => {
    const existing = [{ id: 3, ruleKey: "no-preferred-sources", status: "dismissed" as const, issuePresent: true }];
    expect(planRuleSync(existing, outcomes("product"), "2026-10-03")).toEqual([
      { kind: "presence", id: 3, present: false },
    ]);
  });
});
```

(`ruleAction` and `insertAction` signatures as used in `lib/actions/views.test.ts`; check `syncRuleActions`' option names against `rule-sync-store.ts` and use them exactly. The resolved note is `Resolved — not found in the check of 2026-10-03`.)

`lib/explain/scoring-notes.test.ts`:

```ts
import { scoringNote } from "./scoring-notes";

describe("scoringNote", () => {
  it("explains the move to v2 in the spec's words", () => {
    expect(scoringNote({ from: "v1", to: "v2", at: new Date("2026-10-03T06:00:00Z") })).toBe(
      "Scoring updated: Preferred Sources now only counts for news sites.",
    );
  });

  it("says nothing without a change, and nothing for a version it has no note for", () => {
    expect(scoringNote(null)).toBeNull();
    expect(scoringNote({ from: "v2", to: "v9", at: new Date() })).toBeNull();
  });
});
```

`lib/scan/views.test.ts` (add; `seedScan` gains `formulaVersion`):

```ts
describe("formulaChange", () => {
  it("is null while every score in the window used the same formula", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-3), formulaVersion: "v2" });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), formulaVersion: "v2" });
    expect(formulaChange(db, "acme-docs", T0)).toBeNull();
  });

  it("names the first score on the new formula", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-3) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-2), formulaVersion: "v2" });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), formulaVersion: "v2" });
    expect(formulaChange(db, "acme-docs", T0)).toEqual({ from: "v1", to: "v2", at: daysAfter(-2) });
  });

  it("forgets a change that has left the 30-day window, and ignores other products and failed scans", () => {
    const db = openTestDb();
    seedScan(db, { productId: "acme-docs", at: daysAfter(-50) });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-45), formulaVersion: "v2" });
    seedScan(db, { productId: "fern-and-field", at: daysAfter(-2) });
    seedScan(db, { productId: "fern-and-field", at: daysAfter(-1), formulaVersion: "v2" });
    seedScan(db, { productId: "acme-docs", at: daysAfter(-1), status: "failed", formulaVersion: "v9" });
    expect(formulaChange(db, "acme-docs", T0)).toBeNull();
  });
});
```

`components/products/ProductOverview.test.tsx` (add; `ProductHeader` shows it for product sites only):

```tsx
  it("shows the scoring note under the area cards for a product site", () => {
    renderOverview({ formulaChange: { from: "v1", to: "v2", at: AT } });
    expect(screen.getByText("Scoring updated: Preferred Sources now only counts for news sites.")).toBeInTheDocument();
  });

  it("doesn't show it for a news site, whose score did not change", () => {
    renderOverview({ formulaChange: { from: "v1", to: "v2", at: AT } }, { kind: "news" });
    expect(screen.queryByText(/Scoring updated/)).toBeNull();
  });
```

(`renderOverview(viewOverrides, productOverrides)`: adapt the file's existing render helper so it can override the view and the product; the view fixture gains `formulaChange: null`.)

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/scan lib/actions lib/explain components/products`
Expected: FAIL.

- [ ] **Step 3: Implement the rule and the plumbing**

`rule-def.ts`: `Facts` gets `/** "news" sites are the only ones Preferred Sources applies to. */ productKind: ProductKind;`. `issues.ts`: `evaluateRules(observations, statuses, kind: ProductKind)` sets `productKind: kind` in `facts`; `deriveIssues(observations, statuses, kind)` passes it on. `issue-rules.ts`:

```ts
  ({ readiness, productKind }) => {
    // A Top Stories feature: for any other site the rule never applies, and a clear outcome lets
    // the normal sync resolve an action raised before formula v2.
    if (productKind !== "news") return "clear";
    if (!readiness) return NO_READINESS;
    ...unchanged
```

`worker-deps.ts`: `evaluateRules(scanObservations(db, scanId), statuses, product.kind)`; `product-view.ts`: `productView(db, product, now)` uses `product.id` and `deriveIssues(observations, statuses, product.kind)`; `lib/analyst/export-product.ts` passes `product.kind` to `deriveIssues`; `app/(app)/products/[id]/page.tsx` passes the product to `productView`; `tests/e2e/seed-actions.ts` passes `"product"`.

`lib/scan/views.ts`:

```ts
/** The newest change of scoring formula among a product's good scores in the trend window. */
export type FormulaChange = { from: string; to: string; at: Date };

export function formulaChange(db: Db, productId: string, now: Date): FormulaChange | null {
  const since = new Date(now.getTime() - TREND_DAYS * DAY_MS);
  const rows = scoreRows(db, productId, since)
    .orderBy(asc(scores.computedAt), asc(scores.id))
    .all();
  let change: FormulaChange | null = null;
  for (const [i, row] of rows.entries()) {
    const before = rows[i - 1];
    if (before && before.formulaVersion !== row.formulaVersion) {
      change = { from: before.formulaVersion, to: row.formulaVersion, at: row.computedAt };
    }
  }
  return change;
}
```

`product-view.ts`: `ProductView` gets `formulaChange: FormulaChange | null`, set from `formulaChange(db, product.id, now)`. `tests/helpers/scan-views.ts`: `SeedScan.formulaVersion?: string`, and `storeScores` uses `formulaVersion: scan.formulaVersion ?? "v1"`.

`lib/explain/scoring-notes.ts`:

```ts
import type { FormulaChange } from "@/lib/scan/views";

/** One fixed note per formula version, shown while the change is in the Product page's window. */
const NOTES: Readonly<Record<string, string>> = {
  v2: "Scoring updated: Preferred Sources now only counts for news sites.",
};

/** The note for the first score on a new formula; null when there is no change or no note. */
export function scoringNote(change: FormulaChange | null): string | null {
  return change ? (NOTES[change.to] ?? null) : null;
}
```

`components/products/ScoringNote.tsx`:

```tsx
import { scoringNote } from "@/lib/explain/scoring-notes";
import type { FormulaChange } from "@/lib/scan/views";

/** A quiet line explaining why a score moved when the formula changed, not the site. */
export function ScoringNote({ change }: { change: FormulaChange | null }) {
  const note = scoringNote(change);
  if (note === null) return null;
  return <p className="text-xs text-ink-muted">{note}</p>;
}
```

`ProductHeader.tsx` takes `formulaChange: FormulaChange | null` and renders `{product.kind === "product" && <ScoringNote change={formulaChange} />}` under `<AreaCards />`; `ProductOverview.tsx` passes `view.formulaChange`. `ProductsCard`'s kind display: add to `lib/settings/view.ts` products `kind` and show `Counted as a news site` (a muted line, only for `news`) in `ProductsCard.tsx`, with the existing Settings tests extended by one assertion on a `kind: "news"` fixture product.

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm vitest run && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scoring): no-preferred-sources only fires for news, with a note on the formula change" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cheap deferred minors

**Files:**
- Create: `lib/explain/imports.test.ts`
- Modify: `components/products/PaidSourcePanels.tsx`, `components/products/PaidSourcePanels.test.tsx`, `lib/explain/sources.test.ts`, `README.md` (prose lines over 100 columns), comments over 100 columns in files this plan touched

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**

`lib/explain/imports.test.ts` (the import rule from the product-page plan, now enforced):

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// lib/explain may import values only from itself, lib/scan/labels.ts and
// lib/scan/scoring/sub-score.ts, so client components never bundle the database layer.
const ALLOWED = [/^\.\.?\//, /^@\/lib\/explain\//, /^@\/lib\/scan\/labels$/, /^@\/lib\/scan\/scoring\/sub-score$/];
const IMPORT = /^import\s+(?!type\b)(?:[^"']*?\sfrom\s+)?["']([^"']+)["']/gm;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe("lib/explain imports", () => {
  it("takes only types from outside its allowed modules", () => {
    const bad = files("lib/explain").flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(IMPORT)]
        .map((m) => m[1] ?? "")
        .filter((path) => !ALLOWED.some((ok) => ok.test(path)))
        .map((path) => `${file}: ${path}`),
    );
    expect(bad).toEqual([]);
  });
});
```

(If it flags a real value import, such as `lib/explain/sources-page.ts` importing `NextDailyScan`, check it is `import type`; fix the import, not the test.)

`lib/explain/sources.test.ts` (add; the fallback is for retired collectors only, so every collector Harbour runs has its own entry):

```ts
import { COLLECTOR_IDS } from "@/lib/scan/labels";
...
  it("has an entry for every collector Harbour runs, so the generic fallback is for retired ones only", () => {
    for (const id of COLLECTOR_IDS) expect(() => sourceExplanation(id)).not.toThrow();
  });
```

(`lib/scan/labels.ts` exports the collector list under some name; use it: read the file's exports and import that one.)

`PaidSourcePanels.tsx`: type the panel's source id so a typo fails typecheck instead of relying on a test:

```ts
import type { PaidSource } from "@/lib/costs/paid-sources";

const PANELS: readonly {
  id: string;
  sourceId: PaidSource["id"];
  title: string;
  body: string;
}[] = [ ...unchanged... ];
```

and in `PaidSourcePanels.test.tsx` delete the "only names sources Harbour knows" test (the type now guards it) and make the first test iterate every rendered region against its own source: `for (const region of screen.getAllByRole("region")) { expect(region).toHaveTextContent(sourceExplanation("openai").connect[0] ?? ""); ... }` (already does; keep).

- [ ] **Step 2: Run to verify the new tests**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain components/products/PaidSourcePanels.test.tsx`
Expected: the import test and the collector test PASS or FAIL naming the real offender; fix the offender.

- [ ] **Step 3: README and comment wrapping**

Rewrap README prose lines over 100 columns (tables and code blocks are exempt): find them with

```bash
awk 'length > 100 && !/^\|/ && !/^```/ {print FNR": "length}' README.md
```

(about 20 lines: 8, 49, 66, 160, 172, 206, 259, 300, 343, 435, 478, 608, 713, 793 to 795, 864, 882, 886 at the time of writing; skip fenced code). Then list comments over 100 columns in files this plan touched and wrap them:

```bash
git diff --name-only main -- '*.ts' '*.tsx' | xargs awk 'length > 100 && /^[[:space:]]*(\/\/|\*|\/\*)/ {print FILENAME":"FNR}'
```

- [ ] **Step 4: Run everything**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: enforce the explain import rule, type the paid panels, rewrap long lines" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README, spec notes, e2e smoke for Settings and Agents, and the full suite

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§3, §5.1, §5.4 "As built", §6 "As built", §8 order), `AGENTS.md` (only if the "Plain language" rule needs the vocabulary line), `tests/e2e/settings.spec.ts`, `tests/e2e/agents.spec.ts`, `tests/e2e/shell.spec.ts`, `tests/e2e/scans.spec.ts`, `components/design/*Examples.tsx` (anything the new pieces need on `/design`)

**Interfaces:** consumes `expectPlainLanguage` from `tests/e2e/plain-language.ts`.

- [ ] **Step 1: Extend the e2e smoke check to Settings, Agents and Sources**

`tests/e2e/settings.spec.ts` (add):

```ts
import { expectPlainLanguage } from "./plain-language";

test("Settings speaks plainly: one line per section, no setting names or scan outside Technical details", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expectPlainLanguage(page);
  for (const name of ["Products", "Schedules", "Connections", "Budget", "Backups", "More settings"]) {
    await expect(page.getByRole("region", { name })).toHaveAccessibleDescription(/\S/);
  }
  // The setup steps are one click away, from the keyboard.
  const summary = page.getByText(/Technical details \(how to connect Claude\)|Technical details \(how to connect PageSpeed/).first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/HARBOUR_[A-Z_]+/).first()).toBeVisible();
});
```

`tests/e2e/agents.spec.ts` (add):

```ts
import { expectPlainLanguage } from "./plain-language";

test("the Agents page and a run page speak plainly", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
  await expectPlainLanguage(page);
  await expect(page.getByRole("button", { name: "Find ideas for Acme Docs" })).toBeVisible();
  const firstRun = page.getByRole("table", { name: "Recent runs" }).getByRole("link").first();
  await firstRun.click();
  await expect(page).toHaveURL(/\/agents\/\d+$/);
  await expectPlainLanguage(page);
  await expect(page.getByText(/Technical details \(step-by-step log of the run\)/)).toBeVisible();
});
```

(The earlier tests in that file have already queued runs, so the table has rows; the spec project order runs `agents` before `scans`.) Add one assertion to the Sources test in `scans.spec.ts`: `await expectPlainLanguage(page)` after loading `/settings/sources`.

- [ ] **Step 2: README**

Update every section this plan changed, once, accurately: the Settings section (Connections, "Not connected yet", setup steps under Technical details, no setting names on screen), the Agents section (Find ideas, run log under Technical details, plain statuses), the Sources section, the sidebar badge ("things worth doing"), **Check now** and "check" vocabulary (done in Task 1; re-grep), the `kind` field (Task 7; confirm the example and the table), the formula section ("v2", Fresh pages, the history note), the e2e section (Settings, Agents and Sources join the plain-language smoke check; the check also forbids the word scan), and "Next up". Run the README checks from AGENTS.md: every command works as written, every setting matches `lib/config.ts` and `.env.example`, every link resolves.

- [ ] **Step 3: Spec "As built" notes**

In `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md`:
- §3: add under the wording table "The owner-facing word for a visibility check is **check** (button: Check now); command names, API routes and settings keep *scan*."
- §5.1 item 4: **Next up** (done in Task 6) with its "As built" line.
- §5.4: an "As built" block: sections and their one-line purposes (`lib/explain/settings.ts`, `agents.ts`); "API keys" is **Connections**; paid sources read "Not available yet"; setting names only inside Technical details; "Discovery" is **Find ideas**; the run page headline is plain and the log sits under Technical details; Sources and Devices follow the same rules; the sidebar badge reads "N things worth doing".
- §6: an "As built" block: `kind` on `Product`, `ScoreContext.productKind`, `FORMULA_VERSION = "v2"`, the rule returns `clear` for product sites so the sync resolves old actions with its ordinary note, the history note shows on the Product page for product sites while the change is within 30 days (`formulaChange`), `aeo.preferredSources` is named "Fresh pages".
- §8: mark step 5 and step 6 done.

- [ ] **Step 4: Check `/design`**

`/design` shows the new pieces (Settings cards with purposes, the key rows, the Agents panels, the Sources list, the scoring note) in light and dark: open `pnpm dev` or the e2e build and look at `/design` in both themes; add any missing example (a `ScoringNote`, a "Not connected yet" key row with its steps) to the matching `components/design/*Examples.tsx`, with fictional data. Every Technical details on that page keeps a unique topic.

- [ ] **Step 5: Run the whole suite**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm check`
Then the full e2e suite on system Chrome with the throwaway config used in earlier steps (copy `playwright.config.ts`, set `channel: "chrome"`; no Playwright browser download): `pnpm test:e2e -c <throwaway-config>`.
Expected: PASS. Fix any e2e assertion still on an old string (the likely ones: `Run research`/`Find ideas` names, `Technical details` clicks before reading logs, the Settings `Connections` region, `Next up`, `things worth doing`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: README and spec notes for step 5 and scoring v2, plain-language e2e for Settings and Agents" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** §3 vocabulary and the owner's "check" word: Task 1 (guard test plus e2e rule). §5.4 Settings and Agents: Tasks 2, 3, 4 (one line per section, Connected / Not connected yet, names only in Technical details). §5.5 messages: Tasks 2 to 5 (messages in `lib/explain/*`, backup wording single-sourced in `lib/explain/backups.ts`); the ledger's remaining raw messages: sidebar and ApprovalsNote (Tasks 2 and 5), Settings/README backup wording (Tasks 2 and 10). §6 scoring: config and formula (Task 7), rule gating, closing, history note (Task 8), README and example config (Task 7). §7: formula tests for both kinds, version bump, rule gating, history note (Tasks 7 and 8); e2e smoke for Settings and Agents (Task 10). Consistency leftovers: Task 6. Deferred minors: Task 9, with the skipped ones named in Decision 14.

**Placeholder scan.** No "TBD" or "similar to". Some steps say "adapt to the file's existing fixture" where the test files' internals aren't visible from the spec (`renderOverview`, `DEVICE`, `BriefingInput` field names, `syncRuleActions` option names, the collector-list export in `lib/scan/labels.ts`): each names the file to copy from, so the implementer reads one file, not the design.

**Type consistency.** `ProductKind` (Task 7) is used as `Facts.productKind`, `ScoreContext.productKind`, `ScoringInputs.productKind`, `evaluateRules(…, kind)`, `deriveIssues(…, kind)`, `scoreContext(db, product, …)`, `productView(db, product, now)` and `Product.kind`; Task 8 relies on exactly those names. `FormulaChange` (Task 8) is defined in `lib/scan/views.ts` and imported by `scoring-notes.ts`, `ScoringNote.tsx` and `ProductView`. `RuleActionStatus.who` (Task 6) is consumed by `IssueItem` and the tests of Tasks 6 and 8. `CLAUDE_*` (Task 3) are consumed by Task 4. `thingsWorthDoing` (Task 5) is used by `briefing.ts` and `Sidebar.tsx`. `approvalsPhrase` and `CANT_OPEN_BACKUP_FOLDER` (Task 2) are used by Settings, the Actions note, Today and the briefing.

**Review Focus coverage.** (1) Task 3 `keys.test.ts`; (2) Task 7 config tests; (3) Task 8 `formulaChange` and `ProductOverview` tests; (4) Task 8 gating tests (open, in-progress, snoozed, dismissed, unknown); (5) Tasks 5 (`DeviceList`), 4 (`RunActivity` with no error text) and 2 (`BackupCard` consistency).
