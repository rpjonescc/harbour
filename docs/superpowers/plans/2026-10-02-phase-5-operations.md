# Harbour Phase 5 (Operations: backups, retention, research refresh, cost ledger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harbour looks after itself: the database is backed up every night and verified, old raw observations are pruned without touching score history, stale research is refreshed once a month, every future paid API call goes through a cost ledger and a monthly budget guard, and one Settings page shows the owner how all of it is set up.

**Architecture:** Three new worker job kinds (`backup`, `retention`, and research jobs with `mode: "refresh"`) run through the existing queue, one at a time, and are queued by small schedules that, like the scan and analyst schedules, are derived from the jobs table (restart-safe, catch-up once, bounded retries). The backup uses better-sqlite3's online backup API in steps from the worker's own connection (WAL keeps the web reading and writing), writes a `.partial` file, verifies it with `integrity_check`, then renames it into place; a successful backup queues the retention job, so observations are only ever deleted right after a verified backup that still holds them. Paid-call plumbing is a `costs` table, a pure budget module and two new `CollectContext` members (`cost`, `budget`); no paid collector is added. The web process only reads (status views for Today, Agents and Settings) and enqueues (Back up now, Refresh stale research).

**Tech Stack:** existing stack only (Next.js 16, Drizzle/SQLite via better-sqlite3 — its `Database#backup()` online backup API, zod 4, Vitest, Playwright, Claude Code CLI via the Phase 2b runner). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-harbour-design.md` §5.2 (`Collector.paid`, `CollectContext` cost ledger and budget guard), §7.2 (research refresh), §9 (Today cost meter, Settings), §11 (backups, retries, catch-up, gaps), §12 (cost control). **Rules:** `AGENTS.md`. **Builds on:** the Phase 2b plan (runner, git gate), the Phase 3 plan (scans, collectors, Sources), the Phase 4 plan (schedules, throttle, Agents panels, Today).

## Global Constraints

- Public repo: fictional data only in code, tests, fixtures and docs (`acme-docs`, "Acme Docs", `example.com`, `owner@example.com`, `/srv/harbour-example/…` for example paths). Real products live only in the gitignored `harbour.config.json`; research only in `HARBOUR_BRAIN_DIR`; backups only in the gitignored data directory (or `HARBOUR_BACKUP_DIR`). Live-run notes in "As built" record counts and timings, never product names, hostnames or home paths.
- The web process never runs a backup, retention, collector or agent: it reads status and enqueues jobs. Worker-only modules of this phase join `FORBIDDEN_FILES` in `tests/web-boundary.test.ts`: `lib/ops/backup.ts`, `lib/ops/retention.ts`, `lib/ops/backup-job.ts`, `lib/scan/collect-context.ts`, `lib/costs/guard.ts`. Worker code never imports `server-only` modules (`lib/auth/guard.ts`, `lib/brain/runtime.ts`, `lib/brain/view-model.ts`).
- Missing data is a gap, never a zero: no backup yet is "No backup yet", not "0 backups, last at —" presented as healthy; month-to-date spend with no `costs` rows is a real `$0.00` only because the ledger is the complete record of paid calls (every paid call must write a row); a research doc with no readable `researched` date is "date unknown" (and counts as stale), never "researched today"; the dry run reports "not counted" rather than 0 when a count query fails.
- Bound everything: backup ≤ 10 minutes wall clock (the progress callback throws past the deadline), 256 pages per step; at most 3 backup attempts per local day (backoff 10 min, then 40 min); 14 backups kept; retention deletes ≤ 2,000 rows per statement and ≤ 250 statements (500,000 rows) per run, at most 500 scans planned per run, yielding to the event loop between statements and stopping between batches when the worker stops; at most 3 research refreshes per month (scheduled) and per click (manual); one scheduled refresh round per calendar month; a single `costs` row is refused above A$100 (a unit-price bug, not a real call).
- File safety: backups are written with mode 600 in a directory with mode 700 (tightened if it already exists); pruning deletes only regular files (checked with `lstat`, never through a symlink) whose names match `^harbour-\d{4}-\d{2}-\d{2}\.db$` (or the `.partial` form of it); anything else in the directory is left alone. `HARBOUR_BACKUP_DIR` may not be inside `HARBOUR_BRAIN_DIR` (refused at startup: the brain is pushed to a remote).
- Secrets: the Settings page and every view model expose key **status** only (`present` / `missing`, and for the Search Console file `present` / `missing` / `file not found`) — never a value, a prefix, a length or a path to a secret file. Backups contain session hashes and the audit log: they never leave the machine through Harbour, are never logged by content, and the README says to treat them like `.env`.
- Scheduling: derived from the jobs table and keyed by the local day / month in `HARBOUR_TIMEZONE` (via `Intl` date parts, DST-safe), catches up once on worker start, never once per missed slot; switchable off for tests (`HARBOUR_SCHEDULED_BACKUP`, `HARBOUR_SCHEDULED_RESEARCH`, both `off` in Playwright's env).
- Agents: the research refresh reuses the research `AgentSpec` (exactly one allowed path: the topic's document), the git gate, the quiet-brain deferral and `claudeArgs()` unchanged; no automatic retry of a failed refresh (§11). Tests never call a real CLI (fake `claude` from `tests/fixtures/fake-claude.mjs`) and never call a paid API (the fake paid collector exists in tests only).
- Every page calls `requireSession()`; every API route checks `getSession()` (401); mutating routes call `rejectCrossSite()` first and parse a strict zod body; Back up now and Refresh stale research are audited (`backup_requested`, `agent_run_requested`).
- Design system: semantic tokens only, rem type scale (no px font sizes), light and dark, every new component on `/design`, accessible names, visible focus, full keyboard path, one owner per interactive label, `role="alert"` for errors and `role="status"` / `aria-live="polite"` for confirmations.
- File-size limits (`.tsx` soft 200 / hard 300, `.ts` 300 / 400, tests 400 / 600). Near the soft limit already: `lib/jobs/queue.ts` (288 — add only the job kinds; new helpers go in their own modules), `lib/scan/run-scan.ts` (263 — the collect context moves out in Task 4 before the budget check goes in).
- README (and `.env.example`, `deploy/README.md` where relevant) updated in the same task as each feature, setting, route, script or page. If a task contradicts the spec, update the spec in the same task (the known ones are listed under "Spec changes").
- Biome forbids non-null assertions (`!`), including in tests: guard instead. Commits: conventional prefix, the attribution trailer your environment specifies, never `--no-verify`. Run `pnpm check` (and check its real exit code) before each commit. Never `pkill`/`killall`; do not run `deploy/install.sh`, `systemctl` or `tailscale` (the controller deploys in Task 6).

## File Structure

```
lib/format/zoned-time.ts (+test)         localTime, zonedInstant, slot helpers, month window (moved from scan-schedule/week)
lib/config.ts (+test)                    + HARBOUR_BACKUP_DIR, HARBOUR_SCHEDULED_BACKUP, HARBOUR_OBSERVATION_SCANS_KEPT,
                                           HARBOUR_SCHEDULED_RESEARCH, HARBOUR_MONTHLY_BUDGET_AUD, future paid-source keys
lib/db/schema/jobs.ts                    jobs.kind + "backup" | "retention"
lib/db/schema/costs.ts                   costs table (+ index.ts export)
drizzle/0010_costs.sql                   generated
lib/ops/backup-files.ts (+test)          naming pattern, backup dir, list, prune selection (web-safe reads)
lib/ops/backup.ts (+test)                runBackup(): online backup → verify → rename → prune (worker only)
lib/ops/backup-job.ts (+test)            runBackupJob / runRetentionJob: events, finish, queue retention (worker only)
lib/ops/backup-schedule.ts (+test)       makeBackupSchedule (03:15, catch-up, 3 attempts), enqueueBackup, nextBackupRun
lib/ops/retention.ts (+test)             planRetention / applyRetention (worker only)
lib/ops/backup-status.ts (+test)         backupStatus(): files + job rows → Settings / Today view (web-safe)
scripts/backup-now.ts (+test)            pnpm backup:now
scripts/retention-check.ts (+test)       pnpm retention:check (dry run, SELECTs only)
lib/agents/research-age.ts (+test)       topicAges (frontmatter `researched`), staleTopics (pure)
lib/agents/refresh-schedule.ts (+test)   monthly slot, queueRefreshes, makeRefreshSchedule
lib/agents/refresh-view.ts (+test)       Agents panel view
lib/agents/prompts.ts, specs.ts (+tests) refresh prompt, AgentSpec.promptVersion, research `mode: "refresh"`
components/agents/ResearchRefreshPanel.tsx (+test)
lib/costs/budget.ts (+test)              pure: micro-AUD, levels, canSpend, projection, formatAud
lib/costs/ledger.ts (+test)              recordCost, spentBetween (DB)
lib/costs/guard.ts (+test)               makeSpend(): CollectContext.cost / .budget (worker only)
lib/costs/paid-sources.ts (+test)        the paid sources Harbour plans to use and their settings (web-safe)
lib/costs/meter-view.ts (+test)          costMeterView() for Today and Settings
lib/scan/collect-context.ts              builds CollectContext (moved out of run-scan.ts)
lib/scan/types.ts, run-scan.ts           Collector.paid, CollectContext.cost/.budget, budget skip
tests/helpers/fake-paid-collector.ts     test-only paid collector
components/today/CostMeter.tsx, BackupNotice.tsx (+tests)
lib/settings/key-status.ts (+test)       key status rows (present / missing only)
lib/settings/view.ts (+test)             settingsView(): products, schedules, keys, budget, backups
app/(app)/settings/page.tsx              the Settings page
app/api/backups/route.ts (+test)         POST Back up now
components/settings/*                    SettingsOverview, ProductsCard, SchedulesCard, KeyStatusCard, BudgetCard, BackupCard, BackUpNowButton
components/shell/nav-items.ts, NavLink.tsx, Sidebar.tsx   Settings link; longest-match active item
components/design/OpsExamples.tsx        design page examples
tests/e2e/settings.spec.ts               Settings, Back up now, cost meter, Refresh stale research
```

---

### Task 1: Nightly backup

**Files:**
- Create: `lib/format/zoned-time.ts` (+ test), `lib/ops/backup-files.ts` (+ test), `lib/ops/backup.ts` (+ test), `lib/ops/backup-job.ts` (+ test), `lib/ops/backup-schedule.ts` (+ test), `scripts/backup-now.ts` (+ test)
- Modify: `lib/jobs/scan-schedule.ts`, `lib/analyst/week.ts` (import from `zoned-time.ts`; their tests unchanged), `lib/config.ts` (+ test), `.env.example`, `lib/db/schema/jobs.ts` + `lib/jobs/queue.ts` (`JobKind` + `"backup" | "retention"`; no SQL — text enum), `lib/agents/view.ts` (`jobLabel`: "Nightly backup: 2026-10-02", "Retention: 2026-10-02"), `worker/index.ts`, `package.json` (`"backup:now": "tsx --env-file=.env scripts/backup-now.ts"`), `playwright.config.ts` (`HARBOUR_SCHEDULED_BACKUP: "off"`), `tests/web-boundary.test.ts`, `README.md`, `deploy/README.md`

**Refactor commit first** (`refactor(time): one module for local-time slots`): move `localTime` from `lib/jobs/scan-schedule.ts` and `zonedInstant` / day arithmetic from `lib/analyst/week.ts` into `lib/format/zoned-time.ts`; callers import from there (no re-exports left behind). Existing tests stay green unchanged apart from import paths.

**Interfaces:**
```ts
// lib/format/zoned-time.ts — pure
export type LocalTime = { day: string; minute: number };
export function localTime(timeZone: string, at: Date): LocalTime;
/** The instant `minute` minutes into local `day`. In a fall-back overlap: the earlier instant.
 *  In a spring-forward gap: the same wall-clock distance after the gap (03:15 → 04:15). */
export function zonedInstant(day: string, minute: number, timeZone: string): Date;
export function addDays(day: string, days: number): string;
/** The local day whose `minute` slot is the latest at or before `now` (today, else yesterday). */
export function latestDailySlotDay(now: Date, timeZone: string, minute: number): string;
/** The first `minute` slot strictly after `now`. */
export function nextDailySlot(now: Date, timeZone: string, minute: number): Date;
/** The local calendar month containing `now`: { label: "2026-10", start, end } (start inclusive, end exclusive). */
export function monthWindow(now: Date, timeZone: string): { label: string; start: Date; end: Date };

// lib/ops/backup-files.ts — fs reads only (web-safe)
export const BACKUPS_KEPT = 14;
export const BACKUP_NAME: RegExp;   // ^harbour-(\d{4}-\d{2}-\d{2})\.db$
export const PARTIAL_NAME: RegExp;  // ^harbour-(\d{4}-\d{2}-\d{2})\.db\.partial$
export function backupFileName(day: string): string;           // throws unless YYYY-MM-DD
/** HARBOUR_BACKUP_DIR, else `<dirname(HARBOUR_DB_PATH)>/backups`, resolved absolute. */
export function backupDirFor(config: Pick<Config, "HARBOUR_BACKUP_DIR" | "HARBOUR_DB_PATH">): string;
export type BackupFile = { name: string; day: string; bytes: number; modifiedAt: Date };
/** Regular files matching BACKUP_NAME, newest day first; [] when the directory does not exist. */
export function listBackups(dir: string): BackupFile[];
/** Pure: which of `names` to delete so the newest `keep` matching backups remain. Never a non-matching name. */
export function backupsToPrune(names: readonly string[], keep?: number): string[];

// lib/ops/backup.ts — worker only
export type BackupResult = { name: string; bytes: number; pages: number; ms: number; kept: number; pruned: string[] };
export async function runBackup(db: Db, opts: {
  dir: string; day: string; now: () => number;
  deadlineMs?: number;   // default 10 min
  pagesPerStep?: number; // default 256
}): Promise<BackupResult>;

// lib/ops/backup-job.ts — worker only
export type OpsJobDeps = { db: Db; config: Config; productIds: () => readonly string[]; now: () => Date; stopping: () => boolean };
export async function runBackupJob(deps: OpsJobDeps, job: Job): Promise<void>;

// lib/ops/backup-schedule.ts
export const BACKUP_MINUTE = 3 * 60 + 15;
export const MAX_BACKUP_ATTEMPTS = 3;
export function enqueueBackup(db: Db, day: string, requestedBy: string | null, now?: Date): { id: number; created: boolean };
export function nextBackupRun(now: Date, timeZone: string, enabled: boolean): Date | null;
export function makeBackupSchedule(deps: { db: Db; timeZone: string; enabled: boolean; clock: () => number }): {
  /** Queues the latest slot day's backup when due (first attempt or a retry); every 30 s and on start. */
  tick(): { jobId: number; day: string; attempt: number } | null;
};
```

**Config:** `HARBOUR_BACKUP_DIR: z.string().min(1).optional()` (refine: not inside `HARBOUR_BRAIN_DIR`, compared on resolved absolute paths), `HARBOUR_SCHEDULED_BACKUP: z.enum(["on","off"]).default("on")`.

**`runBackup` steps, in order:** create `dir` (mode 700, then `chmod 700` as `openDb` does for the data dir); delete leftover files matching `PARTIAL_NAME` (a crashed earlier run); `db.$client.backup(<dir>/harbour-<day>.db.partial, { progress })` where `progress` returns `pagesPerStep` and throws `Backup took longer than 10 minutes` past the deadline (better-sqlite3 closes the backup and rejects; steps run on `setImmediate`, so the worker's heartbeat keeps beating and the web, a separate connection in WAL mode, keeps reading and writing — a write from the web restarts the copy at the next step, which the deadline bounds); `chmod 600` the partial; open it read-write with a separate `better-sqlite3` connection, set `PRAGMA journal_mode = DELETE` (the copy carries the WAL flag from the source; switching makes it one self-contained file that restores without `-wal`/`-shm`), run `PRAGMA integrity_check` and require exactly one row `ok` (else throw `Backup failed its integrity check: <first 3 messages>`), close; `renameSync` the partial onto `harbour-<day>.db` (atomic; replaces a same-day file); then prune with `backupsToPrune(listBackups(dir).map(f => f.name))`, re-checking each name against `BACKUP_NAME` and `lstat().isFile()` before `unlinkSync`. On any failure the partial is removed (best effort) and the error rethrown.

**Job (`runBackupJob`):** params `{ day }`. Events: "Backing up to harbour-2026-10-02.db", then "Backup verified: 12.4 MB, 3,021 pages in 2.1 s; 14 kept, 1 removed (harbour-2026-09-18.db)". On success `finishJob(ok)` (Task 2 adds queueing the retention job here). On failure: error event + `finishJob(failed, message)`; never queues retention. A worker stop mid-backup: the job is failed by `recoverRunningJobs` on next start ("Worker stopped"), the partial is deleted by the next run.

**Schedule rules:** the slot is 03:15 local (`BACKUP_MINUTE`). `slotDay = latestDailySlotDay(now, tz, BACKUP_MINUTE)`. Look at backup jobs with `params.day === slotDay` (via `jobsCreatedSince(db, "backup", now − 3 days)`): none → queue attempt 1 (this is also the catch-up: a worker down at 03:15 queues that day's backup at its first check; a worker down for days queues only the latest slot day — never one per missed night); any `queued`/`running`/`ok` → nothing; all failed and fewer than `MAX_BACKUP_ATTEMPTS` → queue the next attempt once `now − lastFinished ≥ 10 min` (attempt 2) / `40 min` (attempt 3); 3 failed → nothing until the next slot day (terminal; Settings and Today show it — Task 5). A manual **Back up now** (Task 5) or `pnpm backup:now` queues `{ day: <local today> }` and counts as that day's backup. Disabled → `tick()` returns null and logs nothing.

**Worker:** `else if (job.kind === "backup") await runBackupJob(...)` **before** the agent `else` (today every unknown kind falls through to `runAgentJob`); `backups.tick()` once after `startup()` (logged "catch-up: queued backup #N for 2026-10-02") and in the loop next to `analyst.tick()`; the ready line also logs the next backup ("next backup 2026-10-03 03:15 Europe/London" or "nightly backup off").

- [ ] **Step 1: Refactor commit** as above; `pnpm test` green; commit.
- [ ] **Step 2: Failing tests**: `zoned-time.test.ts` (slot day before/after 03:15; `nextDailySlot` across midnight; `monthWindow` for Oct 2026 in `Europe/London` and across the `Australia/Sydney` DST change; `zonedInstant` 03:15 on the spring-forward day in `Europe/Helsinki` (gap → 04:15) and the fall-back day (overlap → the earlier instant)). `backup-files.test.ts` (naming; default dir next to the DB; `listBackups` ignores `notes.txt`, `harbour-2026-10-02.db-wal`, a directory named like a backup and a symlink; `backupsToPrune` keeps 14 newest, never names a non-matching file). `backup.test.ts` on a real temp-file DB with rows (`openDb` + `migrateDb`): file written, mode 600, dir mode 700, no `-wal`/`-shm` beside it, opens and holds the rows, `journal_mode` is `delete`; a write through a second connection during the backup still yields a verified copy; deadline exceeded (inject `now`) → throws, no partial left; leftover partial removed; 15 existing backups + 1 → 14 kept and an unrelated file untouched; integrity failure (inject a corrupt partial via a test seam `verify` option) → throws, final file not created. `backup-job.test.ts`: ok path events; failure → job failed with the message. `backup-schedule.test.ts` with an injected clock: 03:14 → nothing (yesterday's exists); 03:15 → one job for today; second tick → nothing; restart → nothing; worker down two nights → one job for the latest slot day; failure → retry only after 10 min, third only after 40 min, none after 3 failures; manual job for today counts; disabled → nothing. `backup-now.test.ts` in the style of `scripts/analyst-now.test.ts`. Config tests for both settings (inside-brain refusal).
- [ ] **Step 3: Run** them — fail. **Step 4: Implement** in the order files → backup → job → schedule → worker → script. Add `lib/ops/backup.ts` and `lib/ops/backup-job.ts` to `FORBIDDEN_FILES`.
- [ ] **Step 5: Run** `pnpm test`.
- [ ] **Step 6: Docs**: README Configuration (`HARBOUR_BACKUP_DIR`, `HARBOUR_SCHEDULED_BACKUP`), "When things run" → "Nightly backup", a new "Backups and restore" section (where files go, 14 kept, verified, mode 600, treat like `.env`, copy them off the machine yourself, `pnpm backup:now`, and the restore steps: stop both services, copy the chosen `harbour-YYYY-MM-DD.db` over `HARBOUR_DB_PATH`, delete the old `-wal`/`-shm` files, start web then worker); `.env.example`; `deploy/README.md` "Backups" (restore, and that `data/backups` is inside the gitignored data dir). Spec §11 backups (see "Spec changes").
- [ ] **Step 7: Commit** `feat(ops): nightly verified SQLite backup with catch-up and retries`.

**As built:** as specified, with these additions. `zonedInstant` was rewritten (not only moved) to meet its documented gap/overlap rule: it tries the zone offsets a day either side of the wall time, keeps the earlier valid instant, and reads a gap time on the pre-gap clock. `lib/db/client.ts` gains `connectionOf(db)` (the raw better-sqlite3 connection, refused for a transaction, which `Db` also types) because `Db` does not expose `$client`. `runBackup`'s `verify` seam returns the copy's `integrity_check` rows (the default also switches the copy to `journal_mode = DELETE`); the error names at most 3 rows joined by "; ". `describeNextBackup` (backup-schedule) formats the worker's ready line; `describeBackup` (backup-job) formats the verified event, with ", N removed (…)" only when something was pruned; sizes are decimal MB. Live-run timings: recorded in Task 6.

Review fixes: an owner's cancel ends the night (the schedule treats `cancelled` with no error as settled); a cancel or worker stop is checked between copy steps (`runBackup` `shouldStop` → `BackupStopped`), the partial is removed and the job finishes `cancelled` (error "Worker stopped" for a stop, which the schedule retries like a failure, matching the scan convention). Prune never deletes the file just written; a prune error after the rename is an error event on an ok job (`BackupResult.pruneError`). `finaliseCopy` requires `journal_mode` to come back `delete`. The partial is created mode 600 (`openSync` `wx`) before the copy. `PARTIAL_NAME` also matches `.partial-journal|-wal|-shm` leftovers. `HARBOUR_BACKUP_DIR` must be dedicated (not `/`, home or the temp folder) and is compared to the brain on real paths. The worker dispatches agent kinds explicitly (`lib/jobs/job-kinds.ts`) and fails any other kind with "Unknown job kind: …" (`lib/jobs/unknown-job.ts`).


---

### Task 2: Observation retention

Raw observations are the bulk of the database (a crawl stores up to 200 page records a day per product). Scores, scan runs and collector runs are small and power history, so only observations are pruned.

**Files:**
- Create: `lib/ops/retention.ts` (+ test), `scripts/retention-check.ts` (+ test)
- Modify: `lib/ops/backup-job.ts` (+ test: `runRetentionJob`; a successful backup now queues `enqueueJob(db, "retention", { day }, null)`), `worker/index.ts` (`retention` branch before the agent `else`), `lib/config.ts` (+ test: `HARBOUR_OBSERVATION_SCANS_KEPT: z.coerce.number().int().min(7).max(365).default(30)`), `.env.example`, `package.json` (`"retention:check": "tsx --env-file=.env scripts/retention-check.ts"`), `tests/web-boundary.test.ts` (forbid `lib/ops/retention.ts`), `README.md`

**Interfaces:**
```ts
// lib/ops/retention.ts — worker only (planRetention is SELECT-only and also used by the dry run)
export type ProductRetention = {
  productId: string;
  scans: number;                 // scan_runs rows (all kept)
  keptForHistory: number;        // newest N
  keptForCarryOver: number;      // older scans kept because they hold a collector's latest ok run
  pruneScanIds: number[];        // older scans that still have observations, oldest first
  observations: number | null;   // rows to delete; null when the count failed (a gap)
};
export type RetentionPlan = { keep: number; products: ProductRetention[]; truncated: boolean }; // truncated: > 500 scans planned
export function planRetention(db: Db, keep: number): RetentionPlan;
export async function applyRetention(db: Db, plan: RetentionPlan, opts: {
  batchRows?: number; maxBatches?: number; stopping: () => boolean;
}): Promise<{ deleted: number; scans: number; complete: boolean; stopped: boolean }>;

// lib/ops/backup-job.ts — worker only
export async function runRetentionJob(deps: OpsJobDeps, job: Job): Promise<void>; // params { day }
```

**What is kept, per `product_id` found in `scan_runs` (configured or not):**
- every `scan_runs`, `collector_runs` and `scores` row — score history, collector history and Sources stay complete (decision: never pruned);
- the observations of the newest `N` scans by id (`HARBOUR_OBSERVATION_SCANS_KEPT`, default 30, any status);
- the observations of every `running` scan;
- the observations of each collector's **latest ok run** per product (`collector_runs` status `ok`, newest `finishedAt`), wherever it is — this keeps the weekly PageSpeed result that `scoreContext` carries into later scans (and any future weekly collector) even if 30 newer scans skipped it.

Everything else's observations are deleted with `DELETE FROM observations WHERE id IN (SELECT id FROM observations WHERE scan_id IN (…≤ 500 ids) LIMIT 2000)`, one statement per transaction, `await new Promise(setImmediate)` between statements, stopping when `maxBatches` (250) is reached (`complete: false` → event "Stopped at the 500,000-row limit; the rest goes after tomorrow's backup") or `stopping()` is true. Every reader of observations reads only a product's latest good scan (product page, Today issues, rule sync, weekly export) or the carried-over collector run, so nothing visible changes; `collector_runs.items` keeps the count of what each scan stored.

**Not pruned (decision):** `jobs`, `agent_run_events`, `agent_runs`, `action_events` (already capped at 50 per action) and `audit_log`. Job rows are a few per day (scans, git saves, backups), are referenced by `scan_runs`, `agent_runs`, `proposals`, `actions` and `costs`, and drive the schedules' "already ran" checks; deleting them would need cascading rules for little space. The dry run prints their row counts so growth stays visible; revisit if `jobs` passes 50,000 rows.

**No VACUUM (decision):** freed pages go on SQLite's free list and are reused by the next scans, so the file stops growing at about N scans' worth of observations; `VACUUM` would rewrite the whole file and block the web's writes while it runs. The README says how to reclaim space by hand (stop both services, `sqlite3 harbour.db 'VACUUM'`, start them) if the owner ever lowers N a lot.

**Job (`runRetentionJob`):** queued only by a successful backup job. Events: per product with something to prune, "acme-docs: 11 old scans, 18,240 observations" (product id, not name, so the log is the same everywhere), then "Removed 18,240 observations from 11 scans" (or "No old scans to prune (newest 30 kept, plus the latest result of each source)"). A thrown error → error event + job `failed`; nothing is retried before the next night (each batch is its own transaction, so a failure leaves earlier batches done and the rest for tomorrow). A worker stop → job `cancelled` "Worker stopped".

**Dry run (`pnpm retention:check`):** opens the database with `openDb` (no migrations) and runs `planRetention` only — SELECTs, no writes — then prints one line per product as above plus "keep N", and totals including `jobs`, `agent_run_events` and `observations` row counts. Exits 1 with the message if the database is missing.

- [ ] **Step 1: Failing tests**: `retention.test.ts` on `openTestDb()` with scans built by the Phase 3 store functions (`tests/helpers/scan-run.ts`): 35 scans → the 5 oldest planned and pruned, newest 30 untouched; scores/scan_runs/collector_runs counts unchanged; an old scan holding PageSpeed's latest ok run is kept (`keptForCarryOver: 1`) and `scoreContext` still finds its observations after `applyRetention`; a running scan is never pruned; two products are counted separately; an unconfigured product id is handled the same; a second run plans nothing; `maxBatches: 1, batchRows: 10` stops with `complete: false` and the rest goes on the next call; `stopping()` stops between batches; `planRetention` is read-only (no row changes). `backup-job.test.ts`: a successful backup queues one retention job, a failed one none; retention job events and failure path. `retention-check.test.ts` (prints the plan for a fixture DB; writes nothing). Config test for the bounds (6 and 366 refused).
- [ ] **Step 2: Run** — fail. **Step 3: Implement**; wire the worker branch.
- [ ] **Step 4: Run** `pnpm test`.
- [ ] **Step 5: Docs**: README "Backups and restore" → "Data kept" (what is pruned and kept, N, no VACUUM and how to reclaim space by hand, `pnpm retention:check`), Configuration row, `.env.example`. Spec §11 (see "Spec changes").
- [ ] **Step 6: Commit** `feat(ops): prune old scan observations after each verified backup`.

**As built:** as specified, with these additions. Retention also keeps the scan behind the product's latest scores (newest `computedAt` of an ok/partial scan): the product page and weekly export read it, and it can be older than the newest N when every later scan failed; `keptForCarryOver` counts every older scan kept for a reader (running, a collector's latest ok run, latest scored). A kept scan keeps all its observations, not only the carried-over collector's. `latestOkRun` is exported from `lib/scan/store.ts` so the carry-over rule has one definition. The dry run opens the database with a new `openReadonlyDb` (better-sqlite3 `readonly`, `fileMustExist`; no chmod, no `journal_mode` pragma) instead of `openDb`, so it cannot write; SQLite still creates an empty `-wal` and the `-shm` index (same mode as the database) when none exist. An owner's cancel stops retention between batches like a worker stop (job `cancelled`, no error). Review fixes: only registered collectors (`COLLECTORS`) are carried over, so a removed collector's last run never pins an old scan; `OpsJobDeps.retention` injects the delete limits (the row-limit event names the actual limit); a failure to queue retention after a verified backup is an error event "Could not queue retention: …" on the ok backup job; `pnpm retention:check` reports an open failure with a clear message (it needs write access to the data folder for `-shm`/`-wal`). A plan cut at 500 scans adds the event "Pruned the oldest 500 scans; the rest goes after tomorrow's backup". Live-run counts: recorded in Task 6.

---

### Task 3: Monthly research refresh

**Files:**
- Create: `lib/agents/research-age.ts` (+ test), `lib/agents/refresh-schedule.ts` (+ test), `lib/agents/refresh-view.ts` (+ test), `components/agents/ResearchRefreshPanel.tsx` (+ test)
- Modify: `lib/agents/prompts.ts` (+ test: `refreshPrompt`), `lib/agents/specs.ts` (+ test: research `mode`, `AgentSpec.promptVersion`), `lib/jobs/run-job.ts` (record `spec.promptVersion`; drop the kind check), `lib/agents/view.ts` (`jobLabel`: "Refresh: Glossary"), `app/api/agents/run/route.ts` (+ `routes.test.ts`: `{ kind: "refresh" }`), `app/(app)/agents/page.tsx`, `lib/format/zoned-time.ts` (+ test: monthly slot), `lib/config.ts` (+ test: `HARBOUR_SCHEDULED_RESEARCH: z.enum(["on","off"]).default("on")`), `.env.example`, `worker/index.ts`, `tests/fixtures/fake-claude.mjs` (write `researched:` from the prompt's "Today's date:" line instead of a fixed date), `playwright.config.ts` (`HARBOUR_SCHEDULED_RESEARCH: "off"`), `README.md`

**Interfaces:**
```ts
// lib/format/zoned-time.ts
/** The latest first-Sunday-of-the-month 21:00 local at or before `now`: { at, month: "2026-10" }. */
export function latestMonthlySlot(now: Date, timeZone: string): { at: Date; month: string };
export function nextMonthlySlot(now: Date, timeZone: string): Date;

// lib/agents/research-age.ts — fs + frontmatter only (web and worker)
export const REFRESH_AFTER_DAYS = 30;
export const MAX_REFRESHES = 3;
export type TopicAge = { topicId: string; title: string; path: string; exists: boolean; researched: string | null };
/** Each RESEARCH_TOPICS document's `researched` date, read with readDoc (unreadable → exists, null). */
export function topicAges(root: string): TopicAge[];
/** Pure: existing docs researched more than 30 days before `today` (or with no date), oldest first, ≤ `limit`. */
export function staleTopics(ages: readonly TopicAge[], today: string, limit?: number): TopicAge[];

// lib/agents/refresh-schedule.ts
export type QueuedRefresh = { jobId: number; topicId: string };
/** Queues up to 3 stale topics, skipping any topic with a research job already queued or running. */
export function queueRefreshes(db: Db, input: {
  root: string; today: string; requestedBy: string | null; month: string | null; now: Date;
}): { queued: QueuedRefresh[]; stale: number };
export function nextMonthlyRefresh(now: Date, timeZone: string, enabled: boolean): Date | null;
export function makeRefreshSchedule(deps: {
  db: Db; root: string; timeZone: string; enabled: boolean; tokenSet: boolean; clock: () => number;
}): { tick(): QueuedRefresh[] };

// lib/agents/specs.ts
export type AgentSpec = { /* … */ promptVersion: string };   // research/discovery "2b-v1", refresh "5-v1", weekly ANALYST_PROMPT_VERSION
// research params: { topic, mode?: "refresh", month?: "YYYY-MM" } — any other mode or a malformed month throws

// lib/agents/prompts.ts
export const REFRESH_PROMPT_VERSION = "5-v1";
export function refreshPrompt(topic: ResearchTopic, products: readonly Product[], today: string): string;
```

**Refresh prompt:** same first line (`TARGET_FILES: <topic.path>`), role and frontmatter block as `researchPrompt` (shared builder, not a copy), plus: "This document already exists. Read it first. Re-check its claims and sources against current information: keep what still holds, correct what changed, add what is new, and remove anything you can no longer support with a source. Set `researched` to today and `review_by` 90 days later. End with a section `## What changed in this refresh` listing the changes (or saying nothing material changed)." Then `RULES`. The spec for `mode: "refresh"`: label "Refresh: <title>", the same single allowed path, `requiredFiles: [topic.path]` (a missing document fails the run before it starts instead of writing a first draft unasked), `promptVersion: REFRESH_PROMPT_VERSION`.

**Schedule rules:** slot = first Sunday of the month at 21:00 local (an hour after the weekly analyst's 20:00 slot, so on that Sunday the FIFO queue runs the analyst first). Due when `latestMonthlySlot(now)` exists and no research job with `params.month === slot.month` was created; then `queueRefreshes(…, requestedBy: null, month: slot.month)`. The month key is the bound: a round that queued jobs never runs again that month, even if they failed (no automatic retry, §11). When nothing is stale it logs "research refresh: nothing stale for 2026-10" and remembers the month in memory (a restart re-checks once — cheap, and still bounded by the month key once anything is queued). A worker down over the slot catches up once at start for the latest slot's month only. Not queued when disabled, when the token is unset (log once "research refresh skipped: no Claude token"), or when `checkBrainRoot` fails (log once). Missing documents are never refreshed (the research sprint writes them; the panel lists them as "not written yet").

**Manual:** `POST /api/agents/run` with strict `{ kind: "refresh" }` → `queueRefreshes(…, requestedBy: login, month: null)` (params `{ topic, mode: "refresh" }`, deduped by the queue) → `{ jobIds, stale }`; 409 `token_missing` as for other agents; audit `agent_run_requested` with `{ kind: "refresh", topics }`. `ResearchRefreshPanel` (Agents page, under the weekly panel): heading "Research refresh", next scheduled run ("Sunday 1 Nov, 21:00" via `formatWeekdayTime`, or "Scheduled refresh is off"), "N of 10 documents are due for a refresh" with their titles and dates ("researched 10 Jan" / "date unknown"), "N not written yet — run the research sprint", and a "Refresh stale research" button (disabled without a token or when nothing is stale; announces "Queued 3 refreshes" or "Nothing is stale" in `role="status"`; errors in `role="alert"`).

- [ ] **Step 1: Failing tests**: `zoned-time.test.ts` (first Sunday when the 1st is a Sunday; before/after 21:00; slot in the previous month until this month's slot; DST month in `Australia/Sydney`); `research-age.test.ts` on a temp brain (missing doc, no frontmatter, bad frontmatter, 31 vs 30 days, oldest-first, limit 3); `refresh-schedule.test.ts` with an injected clock and temp brain (before slot → nothing; slot → ≤ 3 jobs with `month`; second tick and restart → nothing; jobs failed → nothing again that month; nothing stale → nothing and no repeated log; active research job for a topic → skipped; disabled / no token / no brain → nothing; down over the slot → one round at start); `prompts.test.ts` (refresh text, target line, shared frontmatter); `specs.test.ts` (refresh spec: label, one allowed path, `requiredFiles`, `promptVersion`; bad `mode`/`month` refused); `run-job.test.ts` (refresh run with the fake CLI commits the doc and records `5-v1`; missing doc fails before the CLI starts); route tests (`{ kind: "refresh" }`: 200 with jobIds, `stale`, audit; extra key 400; no token 409); `ResearchRefreshPanel.test.tsx`; config test.
- [ ] **Step 2: Run** — fail. **Step 3: Implement**; wire the worker (`refresh.tick()` on start and in the loop).
- [ ] **Step 4: Run** `pnpm test`.
- [ ] **Step 5: Docs**: README Agents → "Research refresh" and "When things run" → "Monthly research refresh", Configuration row, `.env.example`. Spec §7.2 (see "Spec changes").
- [ ] **Step 6: Commit** `feat(agents): monthly refresh of stale research with a manual trigger`.

**As built:** as specified, with these additions. Research job params are parsed with a strict zod object (`topic`, optional `mode: "refresh"`, optional `month` YYYY-MM): any other key, mode or month fails the job "Invalid research params for <topic>" before it starts. `specForJob` takes any kind and throws "Not an agent job: <kind>" itself, so `run-job` no longer checks the kind. A missing required file for a refresh fails with "Missing <path> — run the research sprint to write it first" (discovery keeps its notes hint). `staleTopics` defaults to no limit (the panel lists every due document; the schedule and route cap at `MAX_REFRESHES`) and sorts unknown dates first; a `researched` value that zod accepts but is not a real day counts as unknown. The schedule logs once "research refresh skipped: the brain folder is missing / not a folder / unreadable"; when every stale topic already has a research job it logs "every stale document already has a research job for <month>" and settles the month in memory like "nothing stale". The panel also shows "Scheduled refresh needs a Claude token", explains a disabled button ("Nothing is due for a refresh." / the token), writes "1 of 10 documents is due", and adds the year to "researched 3 Nov 2025" when it is not this year. `monthWindow` now shares a `shiftMonth` helper with the monthly slot. Live-run notes: recorded in Task 6.

---

### Task 4: Cost ledger and budget guard

No paid collector exists yet; this task builds the ledger, the guard and the Today meter so the first paid collector only has to call them. Amounts are stored as integer **micro-AUD** (1 AUD = 1,000,000): per-call prices such as a SERP request are fractions of a cent, so whole cents would round every call to zero, and integers keep monthly sums exact.

**Files:**
- Create: `lib/db/schema/costs.ts` (+ `index.ts` export), `drizzle/0010_costs.sql` (via `pnpm db:generate`; never hand-written), `lib/costs/budget.ts` (+ test), `lib/costs/ledger.ts` (+ test), `lib/costs/guard.ts` (+ test), `lib/costs/paid-sources.ts` (+ test), `lib/costs/meter-view.ts` (+ test), `lib/scan/collect-context.ts`, `tests/helpers/fake-paid-collector.ts`, `lib/scan/run-scan-budget.test.ts`, `components/today/CostMeter.tsx` (+ test)
- Modify: `lib/scan/types.ts` (`Collector.paid`, `CollectContext.cost` / `.budget`), `lib/scan/run-scan.ts` (context from `collect-context.ts`; budget skip), `lib/scan/collectors/{crawler,readiness,pagespeed,search-console}.ts` (`paid: false`), `lib/scan/registry.test.ts` (paid collectors ⇔ `PAID_SOURCES`), `lib/scan/worker-deps.ts`, `tests/helpers/scan-run.ts` (budget deps, default cap 0), `lib/config.ts` (+ test), `.env.example`, `app/(app)/page.tsx`, `components/today/TodayView.tsx` (+ test), `tests/web-boundary.test.ts`, `README.md`

**Schema:**
```ts
export const costs = sqliteTable("costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: timestamp("created_at").notNull(),
  provider: text("provider").notNull(),                 // "dataforseo" | "openai" | … (PAID_SOURCES ids)
  collector: text("collector").notNull(),
  productId: text("product_id"),                        // null for a call not about one product
  units: integer("units").notNull(),                    // e.g. requests or tasks billed
  amountMicroAud: integer("amount_micro_aud").notNull(),
  jobId: integer("job_id").references(() => jobs.id),
}, (t) => [
  index("costs_created").on(t.createdAt),
  check("costs_units", sql`${t.units} >= 0`),
  check("costs_amount", sql`${t.amountMicroAud} BETWEEN 0 AND 100000000`),
]);
```

**Config:** `HARBOUR_MONTHLY_BUDGET_AUD: z.coerce.number().min(0).max(10000).multipleOf(0.01).default(0)` — 0 means no paid calls at all. Paid-source secrets, read only for their status until their collectors arrive: `HARBOUR_DATAFORSEO_LOGIN`, `HARBOUR_DATAFORSEO_PASSWORD`, `HARBOUR_OPENAI_API_KEY`, `HARBOUR_PERPLEXITY_API_KEY`, `HARBOUR_GEMINI_API_KEY` (all `z.string().min(1).optional()`, each with a comment saying so).

**Interfaces:**
```ts
// lib/costs/budget.ts — pure
export const MICRO_PER_AUD = 1_000_000;
export function audToMicro(aud: number): number;                 // rounds to whole micro-AUD
export type BudgetLevel = "none" | "ok" | "warn" | "reached";    // none: cap 0; warn ≥ 80 %; reached ≥ 100 %
export function budgetLevel(spentMicro: number, capMicro: number): BudgetLevel;
export function canSpend(spentMicro: number, capMicro: number, estimateMicro: number): boolean; // cap > 0 && spent + estimate ≤ cap
/** Linear month-end projection; null before one full local day has passed or when nothing was spent. */
export function projectMonth(spentMicro: number, now: Date, timeZone: string): number | null;
export function formatAud(micro: number, locale: string): string; // Intl currency AUD, 2 decimals

// lib/costs/ledger.ts — DB reads/writes, no network (web reads spentBetween)
export type CostEntry = { provider: string; collector: string; productId: string | null; units: number; amountMicroAud: number; jobId: number | null };
export function recordCost(db: Db, entry: CostEntry, now: Date): void;  // validates (ints, ≥ 0, ≤ A$100) or throws
export function spentBetween(db: Db, start: Date, end: Date): number;   // micro-AUD

// lib/scan/types.ts
export type Collector = { /* … */ paid: boolean };
export type CollectContext = { /* … */
  /** Writes a costs row for a paid call already made (product, collector and job filled in). */
  cost: { record(entry: { provider: string; units: number; amountMicroAud: number }): void };
  /** Whether a paid call estimated at `estimateMicroAud` fits this month's budget. Ask before every paid call. */
  budget: { allow(estimateMicroAud: number): boolean };
};
export type ScanDeps = { /* … */ budget: { capMicroAud: number; timeZone: string } };

// lib/costs/guard.ts — worker only
export function makeSpend(db: Db, input: {
  capMicroAud: number; timeZone: string; now: () => Date; productId: string; collector: string; jobId: number;
}): Pick<CollectContext, "cost" | "budget">;
/** Why a paid collector is skipped before it runs, or null: "budget: no monthly budget set (HARBOUR_MONTHLY_BUDGET_AUD)" / "budget: A$60.00 monthly budget reached (A$60.12 spent)". */
export function budgetSkipReason(db: Db, capMicroAud: number, timeZone: string, now: Date): string | null;

// lib/costs/paid-sources.ts — web-safe
export type PaidSource = {
  id: "dataforseo" | "openai" | "perplexity" | "gemini";
  label: string; provides: string;
  settings: readonly (keyof Config)[];
  collector: string | null;            // null until its collector exists
};
export const PAID_SOURCES: readonly PaidSource[];
/** Sources whose collector exists and whose every setting is present (none in this phase). */
export function connectedPaidSources(config: Config): PaidSource[];

// lib/costs/meter-view.ts — web-safe
export type CostMeterView =
  | { state: "no-paid-sources"; spentMicro: number }
  | { state: "no-budget"; spentMicro: number }            // paid sources connected, cap 0: paid calls are off
  | { state: "ok" | "warn" | "reached"; spentMicro: number; capMicro: number; projectedMicro: number | null };
export function costMeterView(db: Db, config: Config, now: Date): CostMeterView;
```

**Runner:** `lib/scan/collect-context.ts` takes over building `CollectContext` from `run-scan.ts`'s `attempt` (refactor commit first, behaviour unchanged), then adds `cost` and `budget` from `makeSpend`. In `runCollector`, after the weekly check and before `attempt`: when `collector.paid` and `budgetSkipReason(...)` is not null, record `skipped` with that reason (spec §12 "skipped: budget") and the event "<Label>: skipped — budget: …"; free collectors never consult the budget. A paid collector whose `budget.allow()` returns false returns `{ status: "skipped", reason: "budget: …" }` itself (the fake collector shows the pattern). `cost.record` rows are written even when they push spend past the cap (the ledger records what happened); a `recordCost` validation error fails that collector (a pricing bug must be visible, never silently unrecorded). Month boundaries come from `monthWindow(now, HARBOUR_TIMEZONE)`.

**Fake paid collector (tests only):** `fakePaidCollector({ pricePerCallMicro, calls })`: `paid: true`; for each call, `if (!ctx.budget.allow(price)) return skipped("budget: …")`, then `ctx.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: price })`; returns one observation per call. Never touches the network.

**Today meter (`CostMeter`, in Today's header area):** `no-paid-sources` → "No paid sources connected" (plus "A$1.23 spent this month" only if spend > 0, e.g. after a source was disconnected); `no-budget` → "Paid sources are off: no monthly budget set" linking to README "Costs and budget"; `ok` → "A$12.40 of A$60.00 this month · on track for A$31.00"; `warn` (≥ 80 %) → same text with a warn tag "80 % of budget" (`--warn` tokens); `reached` → "Budget reached — paid sources are paused until 1 Nov" (`role="status"` text, not an alert: it is expected behaviour). A `<meter>` element with an accessible name ("Paid API spend this month") shows the fraction when a cap is set. The sample Today shows the meter too (it is real data, not sample).

- [ ] **Step 1: Refactor commit** (`refactor(scan): build the collect context in its own module`); `pnpm test` green.
- [ ] **Step 2: Failing tests**: `budget.test.ts` (levels at 0 %, 79.9 %, 80 %, 100 %; `canSpend` with cap 0, exact fit, one micro over; projection on day 1 (null), mid-month, in a 28-day February; `audToMicro(0.1)` exact; `formatAud`); `ledger.test.ts` (insert; check constraints; > A$100 refused; non-integer refused; `spentBetween` only counts the window); `guard.test.ts` (records with product/collector/job; `allow` reads current month spend each call; month window in the configured zone — a row at 23:30 local on 31 Oct counts for October); `run-scan-budget.test.ts` with `fakePaidCollector` (cap 0 → skipped before running with the "no monthly budget" reason, free collectors still ok, scan `ok`; cap A$1 with A$0.99 spent and 2-cent calls → the collector's own `allow` refuses after 0 calls and returns skipped; at 100 % → skipped before running; rows carry productId, collector and jobId; a bad `record` fails only that collector); `paid-sources.test.ts` + `registry.test.ts` (every registry collector with `paid: true` appears in `PAID_SOURCES` with that collector id, and vice versa; none connected in this phase); `meter-view.test.ts` (each state); `CostMeter.test.tsx` (texts, meter name, warn tag); `TodayView.test.tsx` (meter present on real and sample Today); config tests (budget bounds, `multipleOf`, future keys optional).
- [ ] **Step 3: Run** — fail. **Step 4: Implement**: schema + `pnpm db:generate` (inspect the SQL: one table, index, checks), budget, ledger, guard, paid sources, runner change, meter and Today wiring. `lib/costs/guard.ts` and `lib/scan/collect-context.ts` join `FORBIDDEN_FILES`.
- [ ] **Step 5: Run** `pnpm test`; confirm `run-scan.ts` is under 300 lines.
- [ ] **Step 6: Docs**: README "Costs and budget" (ledger, micro-AUD, cap 0 default meaning no paid calls, 80 % warning, 100 % pause, what the meter says, that no paid source exists yet), Configuration rows (budget and the five reserved keys, marked "not used yet — shown on Settings"), Features (Today cost meter), `.env.example`. Spec §5.2, §12, §2 (see "Spec changes").
- [ ] **Step 7: Commit** `feat(costs): cost ledger, monthly budget guard and Today cost meter`.

**As built:** as specified, with these changes (most from review). The `costs` table also has `status` (`reserved` | `recorded`, CHECK) and `provider` is nullable only while reserved (CHECK `costs_provider`); `0010_costs.sql` was regenerated, not amended. Ledger writes moved to `lib/costs/ledger-write.ts` (worker only, in `FORBIDDEN_FILES` with `guard.ts`, `collect-context.ts` and the new `lib/scan/skip-reason.ts`): `recordCost`, `reserveCost` (budget sum check + insert of a reserved row in one IMMEDIATE transaction), `settleCost`, `dropReservations`; `lib/costs/ledger.ts` (web-safe) keeps `spentBetween` (both statuses) and adds `unconfirmedBetween`. `makeSpend` returns `Spend` = the brief's `Pick` plus `release(abandoned)` and `failure()`, and takes an optional `log`. `allow` refuses estimates below 1 micro-AUD, invalid or above A$100, and anything after `release`. `record` settles the oldest pending reservation; with none it still records the call but sets `failure` ("paid call made without budget.allow"); a refused record keeps its reservation and, after release, is logged as a job error event. `release("returned")` (the collector returned a result) drops unsettled reservations; `release("threw")` (it threw, timed out or was cancelled) keeps them counted until a late record settles them, and the `CollectContext` contract says a sent call must always be recorded, even on error. `settleCost` keeps the reservation's `createdAt`; a cost above its estimate adds a job event ("Paid call cost A$…, above its A$… estimate", `formatAudPrecise`). The runner fails a collector whose `failure()` is set even if it caught the throw. Free collectors get `noSpend` (allow false, record throws). The weekly/budget skip check moved to `lib/scan/skip-reason.ts` and runs inside `runCollector`'s try ("budget check failed: …" fails only that collector). `recordCost` also checks `provider` against `PAID_SOURCES`. `connectedPaidSources` / `costMeterView` take an optional `sources` (default `PAID_SOURCES`) for tests; `CostMeterView` carries `unconfirmedMicro`. `CostMeter` keeps the native `<meter>` (Biome requires the semantic element; values in AUD, `aria-valuetext` "A$x of A$y") with its track and fill restyled through `::-webkit-meter-*` / `::-moz-meter-bar` to `--surface-sunk` and `--accent` (`--warn` from 80 %). Skip reasons format amounts in `en-US` ("A$"); the meter follows `HARBOUR_LOCALE` (README says so). `DOCS_LINKS.costs` and `components/design/OpsExamples.tsx` (cost meter states) were created in this task; Task 5 extends them.

---

### Task 5: Settings page, Back up now and backup health

**Files:**
- Create: `lib/ops/backup-status.ts` (+ test), `lib/settings/key-status.ts` (+ test), `lib/settings/view.ts` (+ test), `app/(app)/settings/page.tsx`, `app/api/backups/route.ts` (+ `route.test.ts`), `components/settings/SettingsOverview.tsx`, `ProductsCard.tsx`, `SchedulesCard.tsx`, `KeyStatusCard.tsx`, `BudgetCard.tsx`, `BackupCard.tsx`, `BackUpNowButton.tsx` (client) (+ `SettingsOverview.test.tsx`, `BackUpNowButton.test.tsx`), `components/today/BackupNotice.tsx` (+ test), `components/design/OpsExamples.tsx`, `components/design/ops-example-data.ts`
- Modify: `components/shell/nav-items.ts` (Settings → `/settings`), `components/shell/NavLink.tsx` + `Sidebar.tsx` (+ tests: one active item, the longest matching `href`), `app/(app)/page.tsx`, `components/today/TodayView.tsx` (+ test), `app/(app)/design/page.tsx`, `lib/audit.ts` (`"backup_requested"`), `lib/docs-links.ts` (`backups`, `costs`), `README.md`

**Interfaces:**
```ts
// lib/ops/backup-status.ts — web-safe (directory listing + job rows)
export type BackupHealth = "ok" | "none-yet" | "failed" | "stale" | "off";
export type BackupStatus = {
  enabled: boolean;
  next: Date | null;
  latest: BackupFile | null;            // newest file on disk
  count: number;                         // files kept (≤ 14)
  lastFailure: { jobId: number; at: Date; error: string; attemptsLeft: number } | null; // newest backup job failed, no ok after it
  lastRetention: { jobId: number; at: Date; status: JobStatus; summary: string | null } | null;
  health: BackupHealth;
};
export function backupStatus(db: Db, config: Config, now: Date): BackupStatus;

// lib/settings/key-status.ts
export type KeyStatus = "present" | "missing" | "file-not-found";
export type KeyRow = { id: string; label: string; settings: string[]; status: KeyStatus; usedFor: string; inUse: boolean; paid: boolean };
/** Every key Harbour reads or will read; status only (never a value, length or path). */
export function keyStatusRows(config: Config, fileExists?: (path: string) => boolean): KeyRow[];

// lib/settings/view.ts
export type ScheduleRow = { id: "scan" | "analyst" | "refresh" | "backup"; label: string; when: string; setting: string; enabled: boolean; next: Date | null };
export type SettingsView = {
  products: { id: string; name: string; url: string; hue: Hue; searchConsoleProperty: string | null; awaitingApproval: number }[];
  isDemoConfig: boolean;
  schedules: ScheduleRow[];
  keys: KeyRow[];
  budget: CostMeterView & { capMicro: number };
  backups: BackupStatus;
  timeZone: string;
};
export function settingsView(db: Db, products: readonly Product[], config: Config, now: Date): SettingsView;
```

**Health rules** (one place, used by Settings and Today): `failed` — the newest backup job failed and no backup job for that day is queued, running or still due a retry (`attemptsLeft === 0`, or it was a manual run); `stale` — backups on and the newest file is older than 48 h, or there is none and the oldest `jobs` row is older than 48 h (Harbour has been running long enough to have one); `none-yet` — on, no file, younger install; `off` — `HARBOUR_SCHEDULED_BACKUP=off` and no failure; else `ok`. Today shows `BackupNotice` only for `failed` ("Last night's backup failed: <error>. Harbour tries again at 03:15 — details in Settings.") and `stale` ("No backup in the last 2 days. Check that the worker is running — details in Settings."), with a link to `/settings#backups`, styled like `SourceFailures` (`--warn-soft`), `role="status"`.

**Settings page (`/settings`, read-only overview; values come from `.env` and `harbour.config.json`, and the page says so once at the top with a link to README Configuration):**
- **Products** — name with product dot, URL, Search Console property or "No Search Console property", "N research targets waiting for approval" linking to `/settings/products/<id>` (approvals stay there, §9 decision of Phase 4); the demo-config notice when the example config is loaded.
- **Schedules** — a table: Daily scan (06:00), Weekly analyst (Sunday 20:00), Monthly research refresh (first Sunday 21:00), Nightly backup (03:15): On/Off tag, next run (`formatWeekdayTime`) or "Off — <SETTING>=off", time zone named once.
- **API keys** — table of `keyStatusRows`: Claude token (agents), PageSpeed, Search Console (credentials file: present / missing / file not found — the path itself is never shown), DataForSEO, OpenAI, Perplexity, Gemini ("not used yet" tag for sources without a collector); the setting name(s) to put in `.env`.
- **Budget** — the cap ("A$0.00 — no paid calls allowed" when 0), month-to-date spend, projection, and the meter state (shared `CostMeter`).
- **Backups** (`id="backups"`) — health tag, last backup ("2 Oct, 03:15 · 12.4 MB"), "N of 14 kept", where (the setting name `HARBOUR_BACKUP_DIR`, or "next to the database"; no absolute path), last failure with its error, last retention result ("Removed 18,240 observations from 11 scans"), and **Back up now** (`BackUpNowButton`: posts, then navigates to `/agents/<jobId>`; busy state; errors in `role="alert"`).
- **More settings** — links to Sources, Devices (passkeys) and each product's approvals.

**Route `POST /api/backups`:** `rejectCrossSite` → `getSession` (401) → strict empty body `{}` (400 otherwise) → `enqueueBackup(db, isoDateIn(tz, now), login)` → `audit("backup_requested", { jobId, day })` → `{ jobId, created }`. Works when scheduled backups are off (a manual backup is always allowed).

**Sidebar:** `NAV_ITEMS` gains `{ label: "Settings", href: "/settings" }` after Devices. With `/settings`, `/settings/sources` and `/settings/devices` all in the nav, `NavLink`'s prefix match would mark two items current; `Sidebar` computes the single active `href` with a pure `activeNavHref(pathname, hrefs)` (exact match, else the longest `href` that prefixes the path at a `/` boundary) and passes `active` down. `/settings/products/<id>` marks Settings.

**Design page:** `OpsExamples` renders the Settings cards and `CostMeter` in each state, and `BackupNotice` (failed, stale), from fictional fixture data, in both themes.

- [ ] **Step 1: Failing tests**: `backup-status.test.ts` (each health state with a temp dir and job rows; retries pending is not `failed`; count/latest from files only matching the pattern); `key-status.test.ts` (every row; GSC file-not-found via injected `fileExists`; output never contains a value — assert against a config whose secrets are sentinel strings); `view.test.ts` (schedules with next runs from a fixed clock; disabled rows; awaiting-approval counts; demo flag); `route.test.ts` (403, 415, 401, 400 extra key, 200 + job + audit row, dedupe → `created: false`); `SettingsOverview.test.tsx` (sections with headings and landmarks, no secret sentinel rendered, links); `BackUpNowButton.test.tsx`; `BackupNotice.test.tsx`; `Sidebar`/`NavLink` tests (one `aria-current` on `/settings/devices`, `/settings`, `/settings/products/acme-docs`).
- [ ] **Step 2: Run** — fail. **Step 3: Implement**; keep each `.tsx` under 200 lines.
- [ ] **Step 4: Run** `pnpm test`; `pnpm dev` → `/settings` and `/design` in light and dark; keyboard from the sidebar through every link and Back up now with visible focus.
- [ ] **Step 5: Docs**: README Pages (`/settings`), Features (Settings, backup health on Today), routes (`POST /api/backups`), "Backups and restore" (Back up now). Spec §9 (see "Spec changes").
- [ ] **Step 6: Commit** `feat(settings): Settings overview with schedules, key status, budget and backups`.

**As built:** as specified, with these changes. `settingsView` takes a fifth argument `isDemoConfig` (the products list alone cannot tell), and `SettingsView` adds `reservations` (this month's reserved `costs` rows, read-only, from a new web-safe `reservationsBetween` in `lib/costs/ledger.ts`; each links its job) and `backupDirSet` (whether `HARBOUR_BACKUP_DIR` is set, never the path). `Sidebar` is a server component without the pathname, so it passes `hrefs` (every main-nav href) to the client `NavLink`, which marks itself current when `activeNavHref(pathname, hrefs)` (in `components/shell/nav-items.ts`) returns its href; product links keep the plain match. Health: `lastFailure` is set when the newest backup job failed; `attemptsLeft` is 0 for a manual run, with the schedule off, or when the failed day is no longer the latest slot day, else 3 minus that day's backup jobs. The retention summary is a failed run's error, else its last "Removed …" line, else its last event. `nextScheduledScans` (scan-schedule) and `formatShortDateTime` ("2 Oct, 03:15") were added. The audit detail is exactly `{ jobId, day }` (also on a dedupe). Each Settings section is a `SettingsSection` (heading id from `useId`, fragment `anchor` only on `/settings`, so the five `BackupCard` examples on `/design` do not repeat ids). The cost-meter example data moved into `components/design/ops-example-data.ts`; `app/(app)/design/page.tsx` needed no change (it already renders `OpsExamples`).

---

### Task 6: End-to-end, deploy and live validation

**Files:**
- Create: `tests/e2e/settings.spec.ts`
- Modify: `playwright.config.ts` (project `operations` → `testMatch: /settings\.spec\.ts/`, depends on `analyst`; shared env already has the backup and research schedules off and no budget), `tests/e2e/prepare.ts` (nothing new if the backup dir defaults inside `./data/e2e`; assert that in a comment), `README.md` (Testing)

**`settings.spec.ts`:**
1. Sidebar "Settings" link → `/settings`; exactly one `aria-current="page"` in the sidebar; then `/settings/devices` marks only Devices.
2. Products: the three fictional products with their Search Console state; approvals links resolve.
3. Schedules: all four rows show "Off" (the E2E env turns scheduled scans, analyst, refresh and backup off).
4. API keys: Claude token "Present", PageSpeed and DataForSEO "Missing"; the page text never contains the fake token value `e2e-fake-token`.
5. Budget: "A$0.00 — no paid calls allowed"; Today shows "No paid sources connected".
6. Back up now → job page shows "Backup verified" and finishes ok; a retention job follows and finishes ok ("No old scans to prune …" or a removal line); back on Settings: "1 of 14 kept" and a last-backup time; Today shows no backup notice.
7. Agents → "Refresh stale research" (the fixture brain's research documents carry old or missing `researched` dates) → "Queued N refreshes" with 1 ≤ N ≤ 3; the first "Refresh: …" job commits one file; the refreshed document's `researched` is today (fake CLI reads the prompt's date).
8. Keyboard: Tab through Settings links and Back up now with visible focus; light and dark render (`data-theme` toggled).
9. `POST /api/backups` without a session → 401; cross-origin → 403.

- [ ] **Step 1: Write** the spec; **Step 2: Run** `pnpm test:e2e` until green (fix product code, never loosen assertions).
- [ ] **Step 3: Run** `pnpm check` — exit code 0. **Commit** `test(e2e): Settings, Back up now and research refresh`.
- [ ] **Step 4 (controller): deploy** — build, restart web and worker per `deploy/README.md`; migration `0010_costs` runs on web start. Verify the worker log shows the backup line ("next backup … 03:15"), the analyst and refresh schedules, and no errors; on a host with an existing DB older than 48 h and no backup, Today shows the stale notice until the first backup.
- [ ] **Step 5 (controller): live validation** — `pnpm backup:now`; the job page shows "Backup verified"; check the file: mode `600` (`stat -c %a`), directory `700`, `sqlite3 <file> 'PRAGMA integrity_check'` prints `ok`, no `-wal`/`-shm` beside it; the retention job follows. Before that, run `pnpm retention:check` and record its totals (rows per table, scans to prune — counts only, no product ids) in "As built"; after the retention job, run it again and confirm nothing is left to prune. Open `/settings` on a phone and a desktop: schedules show the live times, key status matches `.env` (present/missing only), budget A$0.00, backups "1 of 14 kept". Wait for the first scheduled 03:15 backup and record its duration and size.

**As built:** _(controller: deploy notes, live run outcome)_

---

## Spec changes (made in the task that implements them)

- **§11 (Tasks 1–2):** backups use better-sqlite3's online backup API (the `.backup` mechanism) from the worker at 03:15 `HARBOUR_TIMEZONE` into `HARBOUR_BACKUP_DIR` (default `<db dir>/backups`), are verified with `integrity_check` and switched to a single self-contained file before being renamed into place, mode 600; 14 kept; up to 3 attempts per night (10 and 40 minutes apart), then a Today notice; catch-up once for the latest missed night. Observation retention runs only after a verified backup: observations of all but the newest 30 scans per product (`HARBOUR_OBSERVATION_SCANS_KEPT`) are deleted, except each collector's latest ok run; scan runs, collector runs, scores and job rows are kept; no automatic VACUUM.
- **§7.2 (Task 3):** research refresh = first Sunday of the month 21:00 (after the weekly analyst) + manual "Refresh stale research"; a document is due when its `researched` date is more than 30 days old (or missing); at most 3 per month, oldest first; existing documents only; no automatic retry. This "due for refresh" (30 days after `researched`) is deliberately earlier than the viewer's "stale" badge (§6.2, past `review_by`, which research runs set to 90 days).
- **§12 and §2 (Task 4):** the default monthly cap is **0** (no paid calls until the owner sets `HARBOUR_MONTHLY_BUDGET_AUD`); the A$60 in the decisions log becomes an example. Amounts are stored as integer micro-AUD. A paid collector is skipped before it runs at 100 % (or with no budget) and must ask `ctx.budget.allow(estimate)` before each paid call; the meter says "No paid sources connected" until a paid collector exists and is configured.
- **§5.2 (Task 4):** `CollectContext` gains `cost.record()` and `budget.allow()`; `Collector.paid` is required (the four free collectors are `paid: false`).
- **§9 (Task 5):** Settings is a read-only overview (products, schedules with next runs, key status, budget, backups, links); settings are changed in `.env` / `harbour.config.json`, approvals stay on `/settings/products/<id>`, passkeys on Devices. Key status is present / missing (and "file not found" for the Search Console file), not "valid": whether a key works shows as the source's last run on Sources.
- **§14 (Task 4):** "cost ledger and cap" moves from Phase 3 to a new **Phase 5 — Operations** entry (backups, retention, research refresh, cost ledger and budget guard, Settings).

## Spec coverage

§5.2 `paid` collectors, cost ledger and budget guard in `CollectContext` (Task 4); §7.2 research refresh, monthly and manual (Task 3); §9 Today cost meter (Task 4) and backup notice, Settings: products, schedules, budget cap, API key status, passkeys link (Task 5); §11 nightly backup, 14 kept, retries with backoff then a Today banner, catch-up once, bounded resources, gaps never zeros (Tasks 1, 2, 5); §12 costs rows with provider, collector, product, units, AUD amount, monthly cap, 80 % warning, 100 % skip as `skipped: budget`, month-to-date spend and projection (Task 4); §13 fake-clock schedule tests, budget cap tests with a fake paid collector, E2E of Settings (Tasks 1–6).
