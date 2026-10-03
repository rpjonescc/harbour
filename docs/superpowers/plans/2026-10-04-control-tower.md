# Control tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Turn the home page (`/`, still called Today) into a control tower that answers, in order: is everything OK, what needs me, where the work is, how each product is doing, what the agents are doing, and what got better. Add `<Term>` tips, a glossary and "What's this page?" on every page so the owner never has to learn a word.

**Architecture:** Read-only. Pure shapers in `lib/tower/` (tested with plain objects) fed by thin readers (`*-data.ts`) over existing tables and lib functions, plus one single-row `worker_status` table for worker liveness. Server components per tile in `components/tower/`, with small client islands for `Term`, `PageHelp`, light disclosures and `VisibleRefresh`. All wording in `lib/explain/tower.ts`, `lib/explain/glossary.ts` and `lib/explain/page-help.ts`.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Drizzle on SQLite, vitest, Playwright, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-control-tower-design.md`

## Global Constraints

- AGENTS.md rules apply: file limits (tsx soft 200 / hard 300, ts 300/400, tests 400/600; this plan keeps every `.tsx` under 200), semantic tokens only, text in rem via the type scale, light, dark and night, every new component on `/design` (Task 9; the branch merges only after it), accessible names, visible focus, full keyboard path, zod at boundaries, no `any`, no dead code, no new dependency.
- **Wording only from `lib/explain/*`.** No user-facing literal in `components/tower/*` or `lib/tower/*` (pure shapers return keys and numbers; the phrase functions live in `lib/explain/tower.ts`). Add `lib/tower` and `components/tower` to `tests/plain-vocabulary.test.ts` roots.
- Lists on the tower cap at 5 with an "N more" link (spec §3.5). Missing data is a gap, never a zero.
- The tower never mutates: buttons are links. The web process never runs a job.
- Do not use `pnpm fix` (it rewrites escapes). Use `pnpm exec biome format --write` / `check` on your own files, then `pnpm check`.
- Times: formatted on the server in `HARBOUR_TIMEZONE`; no client clock in rendered text.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Public repo: fictional names only (Acme Docs, Acme Blog, `example.com`); run `pnpm check:private` before each commit.
- Test helpers: `openTestDb()` in `tests/helpers/db.ts`, action fixtures in `tests/helpers/actions.ts`, scan helpers in `tests/helpers/scan-views.ts`, fixed time `t0 = 2026-10-02T09:00:00Z`.
- **Board dependency:** only Task 8 needs the Actions board branch merged (it renders `WorkStrip` and passes `loadWorkStrip()` into `needsYou`). Tasks 1 to 7 must not import anything from the Board. If this branch's migration lands first it is 0014 and the Board renumbers; otherwise this one regenerates as 0015.

## Review Focus

- The h1 reads the tower headline; a red (`act`) light always leads it; the briefing still renders, now leading "Your products".
- Worker liveness: beat at 90 s is `ok`, at 3 min `watch`, at 11 min `act`, never written `unknown`; a running job's fresh heartbeat counts as alive even when the beat is old.
- Needs you never shows more than 5, each with exactly one link, in the documented priority; empty state has no button.
- A loader that throws renders the plain failure sentence for that tile only; the rest of the page renders; the error is logged, not swallowed into an empty list.
- `VisibleRefresh`: no refresh while hidden; one immediate refresh on return after 60 s; stops at 120; one timer.
- `Term`: hover (300 ms), focus, tap and Enter/Space all open; Escape closes and keeps focus; the tip is `role="tooltip"` on `aria-describedby`; nothing on the page depends on reading a tip.
- Reduced motion: no animation or transition anywhere in `components/tower/` or on `Term`.
- Night theme passes the contrast tests for body text and every status tone.

---

### Task 1: Glossary and `<Term>`

**Files:**
- Create: `lib/explain/glossary.ts`, `lib/explain/glossary.test.ts`, `components/explain/Term.tsx`, `components/explain/Term.test.tsx`, `components/explain/useTermTip.ts` (client hook: open state, delays, Escape, outside click)
- Modify: `app/globals.css` only for the tip's fade (`--duration-fast`, off under reduced motion)

**Interfaces:**
- Produces in `lib/explain/glossary.ts`:
  - `export type TermId = "check" | "verdict" | "data-source" | "indexed" | "sitemap" | "search-console" | "outside-view" | "cited" | "links-to-you" | "worker" | "schedule" | "backup" | "second-brain" | "agent" | "run" | "pull-request" | "board-column" | "stuck" | "draft" | "voice-profile" | "pillar" | "budget" | "paid-data"`
  - `export type GlossaryEntry = { word: string; meaning: string; more?: { href: string; label: string } }`
  - `export const GLOSSARY: Readonly<Record<TermId, GlossaryEntry>>`
  - `export function termsFor(ids: readonly TermId[]): GlossaryEntry[]` (dedupes, keeps order)
- Produces in `components/explain/Term.tsx` (`"use client"`): `export function Term({ id, children }: { id: TermId; children: ReactNode }): JSX.Element`
- Consumes: nothing new.

- [x] Step 1: failing tests. Glossary: every entry complete; `meaning` is one sentence ending in a full stop, at most 160 characters, no `SEO|GEO|AEO`, no `HARBOUR_`, no "scan" (plain-vocabulary rule); `termsFor` dedupes. Term: renders a button named by its children; tip has `role="tooltip"` and is referenced by `aria-describedby`; opens on focus at once, on hover after 300 ms (fake timers), stays while the pointer is over the tip, closes 150 ms after leaving; click and Enter/Space toggle; Escape closes and focus stays; outside click closes; `more` renders a link; fade class absent when `matchMedia("(prefers-reduced-motion: reduce)")` matches.
- [x] Step 2: implement. Hook holds the timers; component stays under 120 lines. Width cap `max-w-[min(20rem,calc(100vw-2rem))]`, flips below when there is no room above.
- [x] Step 3: `pnpm check`, commit `feat: glossary and a Term tip that explains a word in place`.

### Task 2: "What's this page?" on every page, and the tower's words

**Files:**
- Create: `lib/explain/page-help.ts` (+ test), `lib/explain/tower.ts` (+ test), `components/explain/PageHelp.tsx` (+ test), `components/explain/PageHeader.tsx` (h1, optional intro, PageHelp at the right)
- Modify: the header of each page to use `PageHeader`: `app/(app)/actions/page.tsx`, `app/(app)/agents/page.tsx`, `app/(app)/brain/page.tsx` (or `components/brain/BrainHeader.tsx`), `components/content/ContentPage.tsx`, `components/products/ProductHeader.tsx`, `app/(app)/settings/page.tsx` (or `SettingsOverview`), `app/(app)/settings/sources/page.tsx`, `app/(app)/settings/devices/page.tsx`, `app/(app)/design/page.tsx`. The tower uses it in Task 8.

**Interfaces:**
- Produces in `lib/explain/page-help.ts`: `export type PageId = "tower" | "actions" | "product" | "content" | "agents" | "brain" | "settings" | "sources" | "devices" | "design"`; `export type PageHelpCopy = { purpose: string; howToRead: readonly string[] /* ≤ 5 */; firstStep: string; terms: readonly TermId[] }`; `export const PAGE_HELP: Readonly<Record<PageId, PageHelpCopy>>`.
- Produces in `lib/explain/tower.ts` (used by Tasks 3 to 8): `SECTION_TITLES` (systems, needs, work, products, activity, wins), `LIGHT_LABELS: Record<LightId, string>`, `TONE_WORDS: Record<LightTone, string>`, `agoPhrase(at: Date, now: Date, timeZone: string, locale: string): string`, `towerHeadline(input: { worst: { id: LightId; sentence: string } | null; needsCount: number }): string`, `TILE_FAILED`, `NOTHING_NEEDS_YOU`, `QUIET_WEEK`, `NOTHING_RAN(next: string | null)`, `UPDATES_PAUSED`, and the phrase builders each later task names. Types `LightId = "website" | "worker" | "schedules" | "checks" | "backups" | "sources" | "agents" | "spend"` and `LightTone = "ok" | "busy" | "watch" | "act" | "off" | "unknown"` are declared here so `lib/explain` stays free of `lib/tower` imports.
- Produces in `components/explain/PageHelp.tsx` (`"use client"`): `export function PageHelp({ page }: { page: PageId }): JSX.Element` — disclosure button "What's this page?" (`aria-expanded`, `aria-controls`, `aria-keyshortcuts="?"`), panel with purpose, how to read (ordered list), first step, and "Words on this page" from `termsFor(copy.terms)`; `?` opens it unless focus is in an input, textarea, select or contenteditable.
- Produces `components/explain/PageHeader.tsx`: `export function PageHeader({ title, intro, page, children }: { title: ReactNode; intro?: ReactNode; page: PageId; children?: ReactNode }): JSX.Element`.

- [x] Step 1: failing tests. Every `PageId` has copy; `howToRead` length 1 to 5; every listed term exists; no codes. `agoPhrase` at 0 s, 59 s, 1 min, 59 min, 1 h, 23 h, yesterday, older. `towerHeadline` for all-fine with 0, 1 and 2 needs; for an `act` light leading; plural rules. PageHelp: closed by default, toggles, `?` opens, `?` typed in an input does not, Escape closes and returns focus to the button, terms listed with meanings.
- [x] Step 2: implement; swap each page header for `PageHeader` with no other change to the page; keep existing h1 text and tests passing.
- [x] Step 3: `pnpm check`, commit `feat: What's this page? on every page, and the tower's plain words`.

### Task 3: Freshness, worker beat and the systems loader

**Files:**
- Create: `lib/tower/freshness.ts` (+ test), `lib/ops/worker-beat.ts` (+ test), `lib/db/schema/worker.ts`, `drizzle/00NN_*.sql` via `pnpm db:generate`, `lib/db/migrate-worker-status.test.ts`, `lib/tower/system-data.ts` (+ test), `lib/tower/system.ts` (+ test), `lib/tower/load-tile.ts` (+ test)
- Modify: `lib/db/schema/index.ts`, `worker/run.ts` (one call per loop), `lib/settings/view.ts` (export `scheduleRows`, renamed from the private `schedules`; `settingsView` calls it)

**Interfaces:**
- `freshness(at: Date | null, now: Date, rule: { everyMs: number; graceMs: number }): "fresh" | "late" | "stale" | "never"` (late ≤ 2 × (every + grace)); `export const FRESHNESS_RULES` with the spec §5 table.
- `recordWorkerBeat(db: Db, now: Date): void` (upsert id 1; sets `started_at` only on the first beat after `markWorkerStarted`), `markWorkerStarted(db: Db, now: Date): void`, `workerLiveness(db: Db, now: Date): { lastSeen: Date | null; startedAt: Date | null; runningJob: boolean }` (lastSeen is the newer of `beat_at` and any running job's `heartbeat_at`). The worker throttles to once per 30 s with its own clock.
- `scheduleRows(config: Config, now: Date, tokenSet: boolean): ScheduleRow[]` (moved, unchanged).
- `export type SystemFacts = { webStartedAt: Date; worker: ReturnType<typeof workerLiveness>; schedules: { row: ScheduleRow; lastRun: { status: JobStatus; at: Date } | null }[]; checks: { productId; productName; scannedAt: Date | null; scanning: boolean; failedAt: Date | null }[]; backup: BackupStatus; brain: BrainSyncStatus; failures: SourceFailure[]; agents: { running: Job[]; queued: Job[]; failedUnretried: Job[]; finishedToday: number }; cost: CostMeterView }`
- `systemFacts(db: Db, config: Config, products: readonly Product[], now: Date): SystemFacts` (I/O; bounded queries).
- `export type Light = { id: LightId; tone: LightTone; sentence: string; href: string | null }`; `systemLights(facts: SystemFacts, now: Date, timeZone: string, locale: string): { lights: Light[] /* always 8, fixed order */; worst: Light | null }` (pure; sentences from `lib/explain/tower.ts` plus the existing `sourceTrouble`, backup and cost phrases — no copies).
- `export type TileResult<T> = { ok: true; data: T } | { ok: false; detail: string }`; `loadTile<T>(name: string, read: () => T): TileResult<T>` (catches, `console.error`s with the tile name, returns the failure).

- [x] Step 1: failing tests. Freshness boundaries per rule. Migration creates the table, existing data untouched. Beat upsert, throttling is the worker's (test the worker call with a fake clock through the existing `run-job` helpers or a small exported `beatEvery` helper). Liveness: beat 90 s → ok, 3 min → watch, 11 min → act, none → unknown, old beat plus fresh running heartbeat → ok. Each light's tones and sentences from fixture facts (schedule off → `off`, schedule overdue → `watch`, check running → `busy`, failed check → `act`, backup stale → existing sentence, spend warn and reached, agents running and failed-unretried). `worst` ordering: act > watch > unknown. `loadTile` returns the failure and logs once.
- [x] Step 2: implement; `worker/run.ts` calls `markWorkerStarted` once and `recordWorkerBeat` at the top of each loop.
- [x] Step 3: `pnpm check`, commit `feat: worker heartbeat, freshness rule and the tower's system lights`.

### Task 4: Needs-you and product runway loaders

**Files:**
- Create: `lib/tower/needs-data.ts` (+ test), `lib/tower/needs.ts` (+ test), `lib/tower/runway-data.ts` (+ test), `lib/tower/runway.ts` (+ test)
- Modify: `lib/scan/views.ts` (add `weeklyScoreChanges`, + test in `lib/scan/views.test.ts` or a new `views-weekly.test.ts` if over 400 lines)

**Interfaces:**
- `export type NeedsFacts = { suggested: { count: number; oldest: Date | null }; content: { needsYou: number; ready: number } | null; approvals: { productId: string; productName: string; count: number }[]; failedRuns: Job[] }`; `needsFacts(db, config, products, now): NeedsFacts` (uses `actionCounts`, `approvalsWaiting`, one `scanContent(root, contentProducts, { gates: false })`, jobs failed in 24 h with no later ok of the same kind).
- `export type BoardNeeds = { count: number; href: string; lines: string[] } | null` (shape of the Board's `loadWorkStrip().needsYou`, declared here so Tasks 4 to 7 do not import the Board).
- `export type NeedItem = { kind: "system" | "review" | "ideas" | "content" | "approvals" | "run"; sentence: string; button: { label: string; href: string; name: string /* accessible name */ }; since: Date | null }`; `needsYou(facts: NeedsFacts, lights: readonly Light[], board: BoardNeeds): { items: NeedItem[] /* ≤ 5 */; more: number }`.
- `weeklyScoreChanges(db: Db, productId: string, kind: ProductKind, now: Date): AreaValues<{ now: number; before: number } | null>` (null when either side is missing or `formulaChangedArea` says the formula changed between them).
- `export type RunwayFacts = { product: Product; today: ProductToday; nextAction: ActionRow | null; weekly: AreaValues<{ now: number; before: number } | null>; indexing: IndexingState | null; outside: Pick<OutsideView, "state" | "links" | "ai"> | null; content: { ready: number; needsYou: number; writing: number; ideas: number } | null; claudeTouchedAt: Date | null }`; `runwayFacts(db, config, product, contentScan, now): RunwayFacts` (indexing from `scanState` → `scanFindings` → `indexingState`, not the full `productView`).
- `export type RunwayCard = { productId; name; verdict: Verdict; trend: { direction: "up" | "down" | "steady" | null; phrase: string | null }; next: { title: string; href: string } | null; checked: { phrase: string; tone: LightTone }; highlights: string[] /* ≤ 3 */; contentLine: string | null; claudeLine: string }`; `runwayCard(facts: RunwayFacts, now: Date, timeZone: string, locale: string): RunwayCard`.

- [x] Step 1: failing tests. Needs priority order and the cap of 5 with `more`; empty → no items; act light becomes the first item; board null leaves reviews out; content null leaves content out. `weeklyScoreChanges` with a score exactly 7 days old, none that old, and a formula change between. Runway: verdict from the area average; trend up/down/steady/null; highlights skip missing data (never "0 of 0"), cap 3; content line absent when content is off; Claude line for a touch today, 3 days ago and none in 7 days.
- [x] Step 2: implement.
- [x] Step 3: `pnpm check`, commit `feat: needs-you and product runway data for the tower`.

### Task 5: Activity and wins loaders

**Files:**
- Create: `lib/tower/activity-data.ts` (+ test), `lib/tower/activity.ts` (+ test), `lib/tower/wins-data.ts` (+ test), `lib/tower/wins.ts` (+ test)

**Interfaces:**
- `export type ActivityFacts = { running: Job[]; queued: Job[]; finished: Job[] /* last 24 h, ≤ 50 */; moves: { actionId: number; title: string; productId: string; actor: ActionActor; toStatus: string; at: Date }[] /* ≤ 50 */; scoreRises: { productId: string; area: AreaKey; from: number; to: number; at: Date }[]; nextRun: Date | null }`; `activityFacts(db, products, config, now)`.
- `export type FeedItem = { id: string; kind: "win" | "finished" | "failed" | "running"; sentence: string; at: Date; ago: string; href: string | null; isNew: boolean /* under 5 min */ }`; `activityFeed(facts, products, now, timeZone, locale): { running: FeedItem[]; finished: FeedItem[] /* ≤ 5, wins first, failures last */; more: number; empty: string | null }` (job sentences via `jobLabel`; card moves via a `cardMoveLine` phrase added to `lib/explain/tower.ts`, e.g. "Claude moved 'Add a sitemap' to Done").
- `export type WinsFacts = { doneByDay: { day: string; count: number; withPr: number }[] /* 7 local days */; rises: { productId; area; from: number; to: number }[]; indexedGain: { productId; from: number; to: number }[]; approvedPieces: number | null }`; `winsFacts(db, config, products, now)`.
- `export type WeekWins = { lines: string[] /* ≤ 5 */; bars: { day: string; label: string; count: number }[]; quiet: string | null }`; `weekWins(facts, products, now, timeZone, locale): WeekWins` (rises in verdict words via `verdictFor`; a rise within one band says "up 6", across bands "from Fair to Good").

- [x] Step 1: failing tests: ordering (wins first, failures last), the 24 h window edges, caps and `more`, `isNew` at 4:59 and 5:00, empty sentence with and without a next run; wins day buckets in the owner's timezone across midnight, band-crossing and in-band rises, indexing gain only when both counts are known, approved pieces null when content is off, the quiet line only when every list is empty.
- [x] Step 2: implement.
- [x] Step 3: `pnpm check`, commit `feat: activity feed and weekly wins data for the tower`.

### Task 6: System, needs-you and runway tiles

**Files:**
- Create in `components/tower/`: `StatusLight.tsx` (mark + words), `SystemStrip.tsx` (server: row of lights, summary line, non-fine sentences), `LightDetails.tsx` (client disclosure per light), `NeedsYou.tsx`, `RunwayCard.tsx`, `RunwayGrid.tsx`, `TileFailed.tsx` (the plain failure sentence + `TechnicalDetails`), `index.ts`; a test beside each.
- Modify: `app/globals.css` (the `busy` breathing ring keyframes, off under reduced motion)

**Interfaces:**
- `StatusLight({ tone, label, compact?: boolean })`; `SystemStrip({ result }: { result: TileResult<{ lights: Light[]; worst: Light | null }> })`; `NeedsYou({ result }: { result: TileResult<{ items: NeedItem[]; more: number }> })`; `RunwayCard({ card }: { card: RunwayCard })`; `RunwayGrid({ result, briefing, isSample }: { result: TileResult<RunwayCard[]>; briefing: Briefing; isSample: boolean })`; `TileFailed({ tile, detail }: { tile: string; detail: string })`.
- Each section is `<section aria-labelledby>` with an `h2` from `SECTION_TITLES` and an `id` for the jump list.
- Consumes: Tasks 2 to 4, `Term` (for "worker", "schedule", "data source", "indexed", "cited", "links to you", "draft" where those words appear), `ProductDot`, `Panel`, `Tag`, `TechnicalDetails`, `BriefingText`, `SampleBanner`.

- [x] Step 1: failing tests: eight lights in order with label and tone words (no colour-only meaning: assert the visible text); "All eight are fine." when all ok; non-fine sentences shown worst first, max 5; light disclosure toggles; needs-you ordered list with one link per item named by its item, empty state with no link; runway heading links to the product, next action and content links, highlights and Claude line, sample banner when sample; `TileFailed` renders sentence and details.
- [x] Step 2: implement; each file under 200 lines; tones mapped to semantic tokens only.
- [x] Step 3: `pnpm check`, commit `feat: tower tiles for systems, needs you and product runways`.

### Task 7: Activity and wins tiles, motion and the night theme

**Files:**
- Create in `components/tower/`: `ActivityFeed.tsx`, `WinsPanel.tsx`, `WeekBars.tsx` (seven bars in SVG plus a visually hidden table); tests beside each.
- Modify: `design/tokens.css` (`[data-theme="night"]` block), `lib/theme.ts` (+ `lib/theme.test.ts`: `"night"` in the order), `components/shell/ThemeToggle.tsx` (label and icon for night), `design/contrast.test.ts` and `design/surface-contrast.test.ts` (night), `design/token-list.ts` if it lists themes, `app/globals.css` (the "new" tint fade).

**Interfaces:**
- `ActivityFeed({ result }: { result: TileResult<ReturnType<typeof activityFeed>> })`; `WinsPanel({ result }: { result: TileResult<WeekWins> })`; `WeekBars({ bars }: { bars: WeekWins["bars"] })`.
- `ThemePreference = "system" | "light" | "dark" | "night"`; `nextTheme` cycles system → light → dark → night.

- [x] Step 1: failing tests: running group with busy lights; finished list wins first, at most 5, "N more on the Agents page" link; `isNew` items carry the word "new"; empty sentence; wins lines and quiet line; bars render seven labelled bars and a table with the same numbers; theme order and parsing of "night"; night contrast for `--ink`, `--ink-muted`, `--accent`, `--good`, `--warn`, `--bad` on `--bg`, `--surface`, `--surface-sunk` at AA.
- [x] Step 2: implement; reduced motion turns off the tint and the ring (assert via a CSS test like `design/wave-css.test.ts`).
- [x] Step 3: `pnpm check`, commit `feat: tower activity and wins tiles, calm motion and a night theme`.

### Task 8: Assemble the Tower home — needs the Board merged first

**Depends on:** the Actions board branch merged to `main` and rebased in (for `WorkStrip`, `loadWorkStrip`). Check `components/today/WorkStrip.tsx` and `lib/today/work-strip.ts` exist before starting; if not, stop and report.

**Files:**
- Create: `components/tower/TowerView.tsx` (layout only), `components/tower/TowerHeader.tsx` (h1 headline, date, "updated", jump list, `PageHelp page="tower"`, polite live region), `components/tower/VisibleRefresh.tsx` (client) + `useVisibleRefresh.ts`; tests beside each. `lib/tower/load.ts` (+ test): `loadTower(db, config, products, now)` that calls every reader through `loadTile`.
- Modify: `app/(app)/page.tsx` (calls `loadTower`, passes the note slot and the work strip), `components/today/TodayView.tsx` and `TodayHeader.tsx` (delete if unused after the move; keep `BriefingText`, `NoteCard`, `SampleBanner`), `components/today/TodayView.test.tsx` (move what still applies to `TowerView.test.tsx`).

**Interfaces:**
- `export type Tower = { headline: string; subline: string; systems: TileResult<...>; needs: TileResult<...>; work: TileResult<WorkStripData>; runways: TileResult<RunwayCard[]>; briefing: Briefing; isSample: boolean; activity: TileResult<...>; wins: TileResult<WeekWins>; active: boolean /* a check or agent run is running */ }`; `loadTower(db: Db, config: Config, products: readonly Product[], now: Date): Tower` (passes `loadWorkStrip(db, now).needsYou` into `needsYou`).
- `VisibleRefresh({ active }: { active: boolean })`; `useVisibleRefresh({ everyMs, max, onPaused })`: 60 s or 15 s when active; no refresh while `document.visibilityState !== "visible"`; one immediate refresh on return after 60 s hidden; stops at 120 and shows `UPDATES_PAUSED` with a Reload button; one interval; cleared on unmount. Replaces `RefreshWhileScanning` on this page only.
- `TowerView` order: header, systems, needs you + note card (two columns from 1024 px), work strip, products, activity + wins (two columns from 1024 px).

- [x] Step 1: failing tests: `loadTower` with one reader throwing still returns the others; headline from lights and needs; TowerView renders sections in reading order with one h1 and six h2s, note card beside needs (absent under quiet), work strip present; VisibleRefresh with fake timers and a mocked `visibilityState` (hidden → no calls; visible → 60 s; active → 15 s; return after 61 s → immediate; cap 120 then paused message); the live region holds only the sub-line.
- [x] Step 2: implement; remove dead Today components and their tests where the tower replaces them (git keeps them).
- [x] Step 3: `pnpm build`, `pnpm check`, commit `feat: the Today page becomes the control tower`.

### Task 9: `/design` examples, end-to-end, docs

**Files:**
- Create: `components/design/TowerExamples.tsx` (+ test), `components/design/tower-example-data.ts` (fictional Acme Docs and Acme Blog: every light tone, a needs list of 5 with "2 more", two runway cards one with gaps, a feed with a win, a failure and a running item, a quiet wins week and a busy one, a failed tile, `Term` and `PageHelp`), `tests/e2e/tower.spec.ts` (+ a `projects` entry in `playwright.config.ts`, seeding through production code like `tests/e2e/seed-actions.ts`).
- Modify: `app/(app)/design/page.tsx` (a "Control tower" Section and a "Terms and page help" Section, using `PageHeader`), `README.md` (Pages table: `/` is the tower; a short "Reading Today" section; night theme; `worker_status`; auto-refresh), `AGENTS.md` (Design system: use `<Term>` for any unavoidable term and add new pages to `PAGE_HELP`; Working with other projects: after a hand-off or status change the main agent checks the product's runway card reads true), `tests/e2e/plain-language.ts` (include `/` sections), the spec's §18 "As built".

- [x] Step 1: e2e: the h1 is the headline; eight lights with words; a seeded suggested action appears in Needs you with a Decide link that lands on the board; a runway card shows the verdict and the next action; a seeded finished job appears in the feed; a term opens on focus and on click and closes on Escape; `?` opens page help; no horizontal scroll at 320 px; reduced motion emulated shows no running animations (`getAnimations()` empty); dark and night load without contrast regressions (axe check on the page); the plain-language smoke passes. Run on system Chrome through a TEMPORARY copy of `playwright.config.ts` with `use.channel: "chrome"` (delete afterwards).
- [x] Step 2: `/design` examples render with no network (demo data only); docs updated; `pnpm check`; commit `docs: control tower on /design, end-to-end, README and AGENTS`.
