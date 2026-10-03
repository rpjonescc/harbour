# Harbour — Design Spec

**Date:** 2026-10-01
**Status:** Approved; Phase 1 implemented

## 1. Purpose

Harbour is a personal "AI operating system": one calm, focused, self-hosted control
centre for all of the owner's projects, where they can see what matters and act on
it. Function over decoration, but visually beautiful.

The first module is **Visibility**: a daily scan of how findable the owner's
products are in classic search (SEO), in AI assistants (GEO) and as direct answers
(AEO), with a weekly AI analyst that turns the data into a report and a
prioritised action plan. The owner need not be an SEO/GEO expert, so a **Second
Brain** (markdown document library) is seeded with cited research on day one.

### Products in scope

Products are the owner's own, configured in `harbour.config.json` (gitignored; path
set by `HARBOUR_CONFIG_PATH`). Each has an `id` (lowercase slug), `name`, `url` and a
`hue` from the design system's product palette (§4); 1–12 products. When the file is
missing, Harbour loads the committed `harbour.config.example.json` and marks it as a
demo config in the UI. An invalid file fails fast at startup — it never silently
falls back. The example uses fictional products:

| Product | Domain | Hue | Visibility character (illustrative) |
|---|---|---|---|
| **Acme Docs** — documentation hosting for small software teams | docs.example.com | amber | National, content-led: strong GEO opportunity on "how do I…" questions. |
| **Lighthouse Café** — a single neighbourhood café | lighthouse-cafe.example.com | blue | Hyper-local SEO: business profile, "near me", suburb terms. |
| **Fern & Field** — an online plant and garden shop | fernandfield.example.com | green | E-commerce: product and category pages, FAQ and how-to content. |

### Non-goals (v1)

- No automatic changes to product sites or repos. Agents never edit product repos.
- No multi-user support, no public exposure beyond the tailnet.
- No in-app document editing (read-only viewer + "open in editor").
- No live chat with agents inside the UI (headless runs only).
- No analytics (GA4 etc.) or Google Business Profile API integration — the scan
  reports their absence as setup actions with guides.

## 2. Decisions log

| Topic | Decision |
|---|---|
| Name / location | `harbour`, a single repo cloned anywhere on the host |
| Stack | Next.js (App Router) + TypeScript, single repo |
| Products | Owner-configured in `harbour.config.json` (zod-validated, gitignored); the repo ships a fictional example |
| Locale | `HARBOUR_TIMEZONE` (default: server zone) and `HARBOUR_LOCALE` (default `en-US`) |
| Hosting | Always-on home PC (Linux), systemd services |
| Remote access | Tailscale only, via Tailscale Serve (HTTPS, own port, default 8444) |
| Auth | Tailscale identity allowlist **and** per-device passkey (WebAuthn) |
| Data store | SQLite via Drizzle ORM (`harbour.db`) |
| Docs store | Markdown files in a separate private directory/repo (`HARBOUR_BRAIN_DIR`), git-versioned; never in the code repo |
| Agent runtime | Claude Code headless (`claude -p`) launched by the worker |
| Paid data | DataForSEO (rankings, SERP features, AI Overviews) + direct AI engine APIs |
| Budget | Lean: ~$20–60/month (example figures). Hard monthly cap `HARBOUR_MONTHLY_BUDGET_AUD`, default **0** = no paid calls until the owner sets one (e.g. A$60) |
| Existing data | Assumes Google Search Console is verified; no analytics or GBP required |
| Competitors | Agent discovers and proposes 3–5 per product; the owner approves |
| Acting on findings | Action board + "Hand to Claude" prompt copy |
| Visual direction | "Paper & Tide": warm paper, editorial serif, sea-green accent; light + dark |
| Architecture | Option A: Next.js web + Node worker + SQLite, under systemd |

## 3. Architecture

```
Devices ──tailnet──► Tailscale Serve (HTTPS, identity headers)
                          │
                          ▼  127.0.0.1 only
                   harbour-web (Next.js)  ◄──►  harbour.db (SQLite)
                                                    ▲
                   harbour-worker (Node)  ──────────┤
                      ├─ scheduler                   │
                      ├─ collectors ──► external APIs (outbound only)
                      ├─ scoring                     │
                      └─ agent runner ──► claude -p ──► HARBOUR_BRAIN_DIR (markdown, private git repo)
```

Two long-running processes, both systemd user services that restart on failure and
start on boot:

- **harbour-web** — Next.js server bound to `127.0.0.1`. Serves UI and internal
  API routes. Reads SQLite and the brain directory. Can enqueue on-demand jobs (writes a job row
  the worker picks up); never runs collectors or agents itself.
- **harbour-worker** — Node process in the same repo (shared TypeScript code). Owns
  the scheduler, job queue (SQLite table), collectors, scoring and agent runner.

### Repository layout

```
harbour/
  harbour.config.example.json   fictional example products (real config is gitignored)
  app/                 Next.js routes (UI + API route handlers)
  components/          UI components (design system consumers)
  design/              tokens.css (primitives + semantic), theme provider
  lib/
    auth/              tailscale identity check, webauthn, sessions
    products/          product config (zod schema, loader) and catalog
    db/                drizzle schema, migrations, queries
    brain/             markdown loading, frontmatter, links, search index
    jobs/              job queue, scheduler
    collectors/        one module per collector (see §5)
    scoring/           pure scoring functions, versioned
    agents/            agent runner + prompt templates
    costs/             cost ledger + budget guard
  worker/              worker entrypoint
  deploy/              systemd units, tailscale serve config, setup script
  tests/               unit, fixture-based collector tests, e2e (Playwright)
```

The Second Brain does not live in the code repo. `HARBOUR_BRAIN_DIR` (default
`./brain`, gitignored) should point at a separate private git repository: research
notes and reports are personal data. `HARBOUR_BRAIN_DIR` is reserved for Phase 2 and is
not read by the app yet.

## 4. Design system

Three layers so the look can be changed in one place:

1. **Primitives** (`design/tokens.css`): raw palettes (paper, tide, amber, clay,
   neutral ramps), type scale, spacing, radii, shadows, motion durations.
2. **Semantic tokens**: `--bg`, `--surface`, `--surface-sunk`, `--line`, `--ink`,
   `--ink-muted`, `--accent`, `--accent-soft`, `--good`, `--warn`, `--warn-soft`,
   `--bad`, plus a product hue palette (`--hue-amber`, `--hue-violet`,
   `--hue-blue`, `--hue-green`, `--hue-rose`, `--hue-teal`). Each configured
   product picks one hue. Mapped from primitives (`--hue-*-600` on light,
   `--hue-*-300` on dark) separately for light and dark.
   Components use **only** semantic tokens.
3. **Components**: Tailwind configured to read semantic tokens; accessible
   Radix/shadcn primitives restyled to Harbour.

Reference values agreed in the mockup:

| Token | Light | Dark |
|---|---|---|
| bg | #f6f2ea | #16181a |
| surface | #fffdf8 | #1d2023 |
| surface-sunk | #efe9dd | #121416 |
| line | #e2dacb | #2a2e32 |
| ink | #2b2a27 | #e8e2d6 |
| ink-muted | #8a8478 | #8d887e |
| accent | #1f6b5a | #6fbfa8 |
| warn | #a8641c | #e0a35c |
| hue: amber / violet / blue | #c9822e / #7b5ea7 / #3f7fa8 | #e0a35c / #a98bd4 / #7fb3d6 |
| hue: green / rose / teal | #4a8a5a / #b8536b / #2f8a85 | #8cc49a / #e597a8 / #6fc2bd |

Typography: Newsreader (headings, reading column), Inter (UI), tabular numerals for
scores. Theme follows the OS by default with a manual toggle persisted per device.
A `/design` route renders every token and component in both themes.

Text uses rem units so browser zoom works. Every interactive element has an
accessible name, visible focus state and keyboard path.

## 5. Visibility module

### 5.1 Configuration (per product, in SQLite, editable in Settings)

- **Sites**: URLs to crawl (main site only in v1).
- **Keywords**: ~30 per product, with intent tag and location (local businesses
  use their own suburb or town as the location).
- **Questions**: ~12 natural-language questions per product asked to AI engines.
- **Competitors**: 3–5 per product, status `proposed | approved | rejected`.

Scanning of a product's rankings/AI questions is **enabled only after the owner approves
its keyword, question and competitor lists**. The crawler and readiness checks run
from day one.

### 5.2 Collectors

Each collector implements one contract:

```ts
interface Collector {
  id: string;                       // e.g. "crawler"
  cadence: "daily" | "weekly";
  paid: boolean;                    // required; the four free collectors are `paid: false`
  collect(ctx: CollectContext): Promise<CollectorResult>;
}
```

`CollectContext` provides the product, logger, an HTTP client, earlier results, and for paid
collectors the cost ledger (`cost.record({ provider, units, amountMicroAud })`, product, collector
and job filled in) and the budget guard (`budget.allow(estimateMicroAud)`, asked before every paid
call). An allowed estimate is written as a `reserved` costs row in the same IMMEDIATE transaction as
the budget check, and settled to `recorded` at the actual price, keeping the reservation's time (a
job event notes a cost above its estimate). An invalid, unknown or zero price is refused, as is any
call after the collector's run ended. A call that was sent must always be recorded, even when it
then fails. When the collector returns, its unused reservations are dropped; when it throws or is
abandoned, they stay counted until a late record settles them. A free collector's `allow` is always
false and its `record` throws. Every `paid: true` collector is named by a `PAID_SOURCES` entry.
Collectors write raw observations only; they never compute scores.

| Collector | Source | Measures |
|---|---|---|
| `crawler` | Own HTTP crawler (sitemap-seeded, capped at 500 pages/site) | status codes, titles/descriptions, headings, canonical, robots meta, schema.org types, internal links, broken links |
| `pagespeed` | PageSpeed Insights API (free) | Core Web Vitals on key pages (mobile) |
| `readiness` | Own checks | robots.txt rules for Googlebot and AI crawlers (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended), sitemap validity, `llms.txt` presence (measured, not counted from formula v3), FAQ/HowTo (measured, not counted from v3)/Organization/LocalBusiness schema presence, NAP consistency (local businesses), Google Preferred Sources button/deeplink and regularly updated content section |
| `search-console` | GSC API, read-only scope (service account, or the owner's own OAuth sign-in via `pnpm gsc:connect`) | daily clicks, impressions, CTR, position; top queries and pages; new queries |
| `rankings` | DataForSEO SERP API, the product's Google market (the target market's Google domain) | position for each keyword, ranking URL, competitor positions |
| `aeo-serp` | DataForSEO SERP API | AI Overview presence and whether we are cited, featured snippet owner, People Also Ask questions |
| `ai-engines` | OpenAI (web search), Perplexity Sonar, Gemini (grounding), Claude (web search) | for each question: mentioned?, cited (URL)?, position in answer, competitors named, raw answer stored |

Cadence: all daily except `pagespeed` (weekly) to save quota. Exact API products,
endpoints and per-call prices are verified during implementation planning against
current provider docs.

### 5.3 Scoring

Pure, deterministic functions: `observations → sub-scores → SEO/GEO/AEO (0–100)`
per product per day. Each score row stores its `formula_version` and its sub-score
breakdown so the UI can explain any number and formula changes never rewrite
history. Missing data (collector failed) yields a score marked `incomplete`, never
a silent zero.

Initial sub-scores (weights tuned after the research sprint, documented in
`<brain>/research/scoring.md`):

- **SEO**: technical health, indexability, Core Web Vitals, ranking visibility
  (position-weighted keyword coverage), GSC trend.
- **GEO**: mention rate across engines × questions, citation rate, average answer
  position, share of voice vs approved competitors, AI crawler access.
- **AEO**: AI Overview citation rate, featured snippet ownership, PAA coverage,
  answer-ready content (concise answer blocks; FAQ/HowTo schema is measured but not counted
  from formula v3, see §5.5).

Formula v1 (Phase 3) scores only what the free sources measure: the crawl, readiness checks,
PageSpeed and Search Console. Sub-scores that need paid APIs (engine mentions and citations,
rankings, featured snippets, share of voice) appear as "not connected" notes until a later
formula version adds them. The v1 sub-scores, weights and rounding are recorded in the Phase 3
plan's "As built — scoring" notes.

### 5.4 Rule-based quick actions

After scoring, deterministic rules raise actions immediately (e.g. "page lost its
title", "AI crawler blocked in robots.txt", "sitemap 404", "keyword dropped >5
positions"). Each rule has a stable id so the same issue is not duplicated; it
auto-resolves when the condition clears.

v1's rules are the eight issue rules: `missing-title`, `missing-description`,
`broken-links`, `noindex`, `ai-crawlers-blocked`, `no-faq-schema`, `no-llms-txt` and
`no-preferred-sources` (formula v3 retired `no-faq-schema` and `no-llms-txt`, and
`ai-crawlers-blocked` no longer fires for training crawlers alone: see §5.5). "Keyword dropped > 5 positions" waits for the rankings
collector; "sitemap 404" is part of the `seo.indexability` score, not a separate rule
yet. Each rule judges a scan as present, clear or unknown; auto-resolve happens only
when the rule's collectors ran ok (unknown never creates, resolves or reopens an
action). Dismissed actions stay dismissed while the issue persists and reopen if it
clears and comes back; snoozed actions whose issue clears are marked done; an action
the owner marked done reopens if the next scan still finds the issue.

### 5.5 Scoring v3 (amendment, 2026-10-04)

**What changed.** The owner's scoring research gives zero weight to tactics Google says do
nothing, and says training crawlers are a policy choice to be scored neither way. Formula v3
follows it:

- `aeo.qaCoverage` (FAQPage/HowTo/QAPage markup) and `geo.llmsTxt` get weight 0. Google stopped
  showing FAQ rich results on 7 May 2026, and its AI guide lists llms.txt as not needed. Both are
  still measured and shown, tagged "Not counted", with one plain line saying why
  (`notCounted` in `lib/explain/subscores/`). FAQ and HowTo markup also no longer make a page
  "citation-ready" in `geo.citations` (Article schema and question headings still do).
- Their weight is spread over the rest of each total in proportion, rounded to whole percents
  (largest remainder): GEO 30/25/30 → AI crawler access 35%, entities 30%, citations 35%; AEO
  35/25 → concise answers 58%, fresh pages 42%.
- `geo.aiCrawlers` counts only the agents that fetch pages to answer questions (`AI_RETRIEVAL_AGENTS`:
  OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot). The training crawlers
  (`AI_TRAINING_CRAWLERS` in `lib/scan/robots.ts`: GPTBot, ClaudeBot, Google-Extended, CCBot,
  Bytespider) are listed in the evidence as "not counted".
- `geo.aiEngines` says it is measured in How the web sees you and not counted yet, or why it is
  not measured (Treg not connected, no questions chosen, not checked yet).
- Rules: `no-faq-schema` and `no-llms-txt` are retired (`retiredRule`): they always clear with a
  reason, so the normal rule sync moves their open, in-progress or snoozed actions to Done with
  "Resolved in the check of <date>: Harbour no longer suggests this. …" and keeps their history;
  a dismissed one stays dismissed. `ai-crawlers-blocked` clears with a note when only training
  crawlers are blocked, and is always high impact when it fires.
- The analyst export carries each sub-score's weight, and the prompt says not to suggest work on
  a weight-0 sub-score.

**What the owner sees on the first check after deploy.** GEO and Answer-ready scores move once,
on every product (no SEO change). `formulaChangedArea` knows v3 changed `geo` and `aeo` for both
kinds, so no change is shown beside those two scores and the daily note and weekly report don't
call the move an improvement or a decline. For 30 days the product page says: "Scoring updated:
FAQ markup, llms.txt and AI training crawlers are still checked but no longer count, so a move in
Recommended by AI assistants or Answer-ready this time comes from that change, not your site."
The FAQ, llms.txt and training-crawler actions move to Done with their note.

## 6. Second Brain

### 6.1 Storage

The brain lives in `HARBOUR_BRAIN_DIR`: a separate private directory, ideally its own
private git repo, never inside the Harbour code repo.

```
<HARBOUR_BRAIN_DIR>/
  research/   00-start-here.md, glossary.md, scoring.md, seo/, geo/, aeo/
  products/   <product-id>/  (strategy, keywords, questions, competitors)
  reports/    daily/, weekly/
  inbox/
```

Markdown with YAML frontmatter:

```yaml
title: How AI engines pick their sources
tags: [geo]
researched: 2026-10-01
confidence: medium        # low | medium | high
review_by: 2027-01-01
sources: [https://…, …]
```

The brain directory is its own git repo; agent runs commit their changes with a descriptive
message so every change is reviewable and reversible.

### 6.2 Viewer

Three columns: file tree, reading column (Newsreader, ~65ch), context rail
(outline, backlinks, sources, actions citing this doc). `[[wiki-links]]` resolve
by filename. ⌘K full-text search via SQLite FTS5, re-indexed on file change
(watcher in the web process). Docs past `review_by` show a "stale" badge. Markdown
is rendered server-side and sanitised. Read-only; "Open in editor" uses a
configurable `editor://` URL.

### 6.3 Research bootstrap (first agent jobs)

1. **Research sprint** — several scoped `claude -p` runs, each writing one area:
   SEO fundamentals, technical SEO checklist, local SEO, how AI engines
   select sources, llms.txt and AI crawlers, AEO and AI Overviews, glossary,
   beginner "start here" guide, scoring rationale. Every claim cites a source; each
   doc ends with "What this means for" each configured product.
2. **Product discovery** — per product: proposed keywords (~30), AI questions
   (~12), competitors (3–5) with evidence, written to `brain/products/<name>/` and
   inserted into SQLite as `proposed`. The owner approves in Settings.

## 7. Agents

### 7.1 Runner

The worker spawns `claude -p` with:

- a prompt template (`lib/agents/prompts.ts`, `lib/analyst/prompt.ts`) filled with context
  (paths, dates; for the weekly analyst the data export itself, embedded in the prompt as
  fenced JSON labelled as data, capped at 48 KiB with a `truncated` note — not a separate
  file; the agent reads the research docs itself),
- working directory: the brain directory (`HARBOUR_BRAIN_DIR`, referred to as `brain/` below),
- an explicit allowed-tools list: web search/fetch, read anywhere in `brain/`,
  write within `brain/` only; no shell, no access to product repos,
- a wall-clock timeout and max-turns limit,
- structured output: the run writes markdown files and a JSON `proposals.json`
  (actions to suggest) that the worker validates against a schema before
  importing.

Each run is recorded in `agent_runs` (prompt version, start/end, status, exit code,
stdout/stderr tail, files changed, git commit). A run that fails or produces
invalid output is marked failed with the reason; nothing partial is imported.

### 7.2 Agents in v1

| Agent | Trigger | Output |
|---|---|---|
| Research sprint | Manual (once, re-runnable per topic) | `brain/research/**` |
| Product discovery | Manual per product | `brain/products/<p>/**` + proposed keywords/questions/competitors |
| Weekly analyst | Sunday 20:00 (`HARBOUR_TIMEZONE`) + manual | `brain/reports/weekly/YYYY-Www.md` + proposed actions |
| Research refresh | First Sunday of the month 21:00 (`HARBOUR_TIMEZONE`) + manual | updates stale research docs |

The weekly analyst receives a JSON export of the last 7 days (scores, deltas, key
observations, open actions), embedded in its prompt and capped at 48 KiB, and reads the
research docs itself; its report covers: where we
stand, what improved, what got worse, top opportunities, and new competitors seen.

The research refresh runs on the first Sunday of each month at 21:00 (an hour after the weekly
analyst, which runs first in the queue) and on demand ("Refresh stale research" on Agents). A
document is due when its `researched` date is more than 30 days old, or missing or unreadable
(a date more than a day in the future counts as unreadable).
Each round queues at most 3 refreshes, oldest first, for existing documents only (missing ones
are left to the research sprint); one scheduled round per month, and a failed refresh is not
retried automatically. A refresh is a research run of the same topic with the same single
allowed path and git gate: it re-checks the document, updates `researched` and `review_by`, and
ends with "What changed in this refresh". This "due for refresh" (30 days after `researched`)
is deliberately earlier than the viewer's "stale" badge (§6.2, past `review_by`, which research
runs set to 90 days).

## 8. Actions board

- Sources: rule-based (§5.4) and agent proposals (§7).
- Fields: product, area (SEO/GEO/AEO), title, why it matters, how to fix, impact
  (high/med/low), effort estimate, evidence links, brain doc links, status.
- Agent proposals arrive as `suggested`; the owner on the board, or Claude via
  `pnpm actions`, accepts (→ `open`) or rejects them (see "Who changes status by hand").
- Status: `suggested → open → in_progress → done`, plus `snoozed(until)` and
  `dismissed`.
- **Hand to Claude**: copies a prompt containing the product's name and public URL
  (not a repo path: the product config has none, and the prompt is pasted into a
  session already in that repo), the problem, evidence, the suggested fix and
  acceptance check, ready to paste into a Claude Code session in that product's
  repo. Evidence is fenced and labelled as data; an analyst's whole write-up is
  fenced too and labelled "check it before acting".
- The owner's "reject" of a suggestion is the `dismissed` status. Effort is
  `small | medium | large`.
- **Who changes status by hand**: the owner on the board, and Claude through
  `pnpm actions` — an operator CLI run on the host from a Claude Code session, not a worker
  agent (worker-run agents still only propose). Claude's changes use the same transition and
  snooze rules, the same `from` stale-state guard and the same single IMMEDIATE transaction
  (`applyStatusChange`, parameterised by actor), require a written reason (stored as the history
  note, never in the audit detail), and appear in the history as actor `claude`. The owner
  reviews them afterwards and can reopen anything.
- **Pull request link**: an action may carry the GitHub pull request of its fix (`pr_url`,
  `https://github.com/<owner>/<repo>/pull/<number>` only), set or cleared with
  `pnpm actions link`; linking adds a history entry that keeps the status and an
  `action_pr_linked` audit entry. The card links it in a new tab; Hand to Claude is unchanged.
- **Hand-made actions**: `pnpm actions add` lets Claude create a board item (source `manual`, no
  rule key, no analyst job, `issue_present` null) to track work it hands to a project's owner
  session. Rule sync reads only `source = rule` rows, so a scan never closes, rewrites or resolves
  one. The title must differ from any not-done, not-dismissed action of the product; the history
  starts with actor `claude` and a note saying it was added by hand; an `action_created` audit
  entry holds the id, product and status, never the text. Web links given with `--doc` are stored
  as linked evidence, because the `docs` column holds brain paths. Hand to Claude fences a
  hand-made action's text as unchecked, like the analyst's.
- Done actions are re-verified by the next scan where a rule exists; if the
  condition persists the action reopens with a note.

## 9. UI surfaces

- **Today** — date + scan status, one-line summary, score table per product with
  30-day sparklines and deltas, top 3 actions, failing-collector banner, cost meter, and a
  backup notice when the last backup failed with no retry left (when it failed, and the next
  try or "run Back up now" when nightly backups are off), none succeeded in 48 hours, or the
  backup folder cannot be read (a gap, never "0 backups").
- **Product page** (per product) — SEO/GEO/AEO tabs with score breakdowns,
  keyword table, AI question matrix (question × engine: mentioned/cited/competitor),
  technical issues, history charts.
- **Actions** — board/list with filters by product, area, status.
- **Second Brain** — viewer (§6.2).
- **Agents** — run history, logs, "run now" buttons, next scheduled runs.
- **Settings** (`/settings`) — a read-only overview: products (with research targets waiting
  for approval), schedules with their next runs, API key status, the budget (cap, month-to-date
  spend, projection, unconfirmed reservations), backup health with **Back up now**, and links to
  Sources, Devices and each product's approvals. Settings are changed in `.env` /
  `harbour.config.json`; keywords, questions and competitors are approved on
  `/settings/products/<id>`, passkeys on Devices. Key status is present / missing (and "file not
  found" for the Search Console credentials file), never the value, a length or a path — not
  "valid": whether a key works shows as the source's last run on Sources.
- **/design** — living design system reference.

## 10. Security

- Next.js binds to `127.0.0.1` only; `tailscale serve` exposes HTTPS on the tailnet
  on Harbour's own Serve port (default `8444`, `HARBOUR_HTTPS_PORT`), never
  replacing another app's Serve config.
- **Lock 1 — Tailscale identity**: middleware requires the
  `Tailscale-User-Login` header to match an allowlist (the owner's login) and requires
  the request to arrive from the local Serve proxy (loopback). Requests without the
  header are rejected (403). Since only loopback is bound, nothing off the PC can
  reach Harbour except through Serve. A process already running on the PC could
  forge the header — Lock 2 is what covers that case.
- **Lock 2 — passkey**: WebAuthn registration (first device bootstrapped via a
  one-time setup token printed by the setup script); subsequent devices registered
  from an authenticated session. Session cookie: `HttpOnly`, `Secure`,
  `SameSite=Strict`, 30-day sliding expiry, stored hashed in SQLite.
- Mutating routes require CSRF protection: same-origin `Origin` check plus
  JSON-only bodies, on top of `SameSite=Strict` session cookies.
- Strict CSP, security headers, no third-party scripts; fonts self-hosted.
- Secrets in `.env` (mode 600), read only by server code and the worker; never
  serialised to the client. Settings shows key status, not values.
- Rendered markdown sanitised; agent-produced content treated as untrusted data.
- Audit log table: logins, passkey changes, manual runs, settings changes, action status
  changes and pull request links (by the owner or Claude).
- Agent runs have no shell tool and cannot write outside the brain directory.

## 11. Reliability and error handling

- **Job model**: `jobs` table (`queued | running | ok | partial | failed`), with
  attempt count, next attempt time, last error. A scan run is `partial` if some
  collectors fail; failures are visible per collector.
- **Retries**: up to 3 attempts with exponential backoff, then terminal `failed`
  plus a Today banner naming the collector and error. No unbounded loops. Agent jobs,
  including the weekly analyst, are not retried automatically: a failed run is terminal and
  the owner re-runs it (only the import of committed agent output is retried, at most 3
  attempts in all).
- **Missed schedules**: on worker start, any schedule whose last successful run is
  older than its period runs once (catch-up), not once per missed slot. The weekly analyst
  catches up the latest missed Sunday 20:00 slot once (a run created after that slot counts).
- **Crash safety**: jobs left `running` by a dead worker are failed on start, and a job
  its runner leaves `running` is failed as soon as the runner returns.
- **Data gaps** are stored and charted as gaps, never zeros.
- **Bounded resources**: crawler page cap and per-request timeouts; agent
  timeouts and turn caps; captured agent output truncated to a fixed size.
- **Backups**: the worker takes a nightly backup at 03:15 `HARBOUR_TIMEZONE` with
  better-sqlite3's online backup API (the `.backup` mechanism) into `HARBOUR_BACKUP_DIR`
  (default `<db dir>/backups`; never inside the brain) as `harbour-YYYY-MM-DD.db`. Each copy
  is switched to a single self-contained file (journal mode DELETE), verified with
  `integrity_check` and only then renamed into place, mode 600 in a mode-700 folder; 14 kept
  (pruning deletes only regular files named exactly like a backup, never the one just written;
  the folder must be dedicated). Up to 3 attempts per night (10 and 40 minutes apart; a worker
  stop counts as an attempt, an owner's cancel ends the night), then a Today notice; one catch-up for the latest missed night
  only, never one per missed night; each backup is bounded to 10 minutes. The brain directory
  is its own git repo.
- **Retention**: only after a verified backup, a retention job deletes the observations of all
  but each product's newest 30 scans (`HARBOUR_OBSERVATION_SCANS_KEPT`, 7–365), keeping those
  of running scans, of each registered collector's latest ok run (the scorer's carry-over) and of the scan
  behind the latest scores. Scan runs, collector runs, scores, jobs, agent run events, actions
  and the audit log are kept. Deletes are bounded (2,000 rows per statement, each in its own
  transaction, 500,000 rows and 500 scans per run; the rest waits for the next night). No
  automatic `VACUUM`: freed pages are reused. `pnpm retention:check` is a read-only dry run.

## 12. Cost control

- Every paid call writes a `costs` row (status, provider, collector, product, units, amount, job):
  `reserved` at its estimate before the call, `recorded` at the actual price after. Both count
  against the cap; a reservation left by a crash, a failed collector or an abandoned (timed-out) one
  stays counted and Today shows it as "unconfirmed". Amounts are integer **micro-AUD** (1 AUD =
  1,000,000) so per-call prices that are fractions of a cent sum exactly; a row above A$100 is
  refused as a pricing bug and fails the collector. The ledger is the complete record, so no rows is
  a real A$0.00.
- Monthly cap `HARBOUR_MONTHLY_BUDGET_AUD`, default **0** = no paid calls (A$60 is an
  example), over the calendar month in `HARBOUR_TIMEZONE`; shown in Settings. At 80%:
  warning on Today. At 100% (or with no budget): paid collectors are skipped before they
  run (recorded as `skipped: budget: …`); a running paid collector asks
  `ctx.budget.allow(estimate)` before each call. Free collectors and agents on the Claude
  subscription continue.
- Today shows month-to-date spend and a linear projection; until a paid collector exists
  and is configured the meter says "No paid sources connected".

## 13. Testing

- **Scoring**: unit tests over fixture observation sets, including incomplete data.
- **Collectors**: tests against recorded API responses (fixtures); no paid calls in
  tests. Contract test that every collector conforms to the interface.
- **Worker**: fake-clock tests for schedules, catch-up, retries/backoff ceiling,
  stale-job recovery, budget cap.
- **Auth**: tests for rejection without header, wrong identity, missing passkey
  session, CSRF failure; happy path.
- **Brain**: frontmatter parsing, wiki-link resolution, backlinks, sanitisation.
- **Agents**: runner tested with a fake `claude` binary (success, timeout, invalid
  proposals JSON).
- **E2E**: Playwright smoke of Today, Product, Actions, Brain, Settings in light
  and dark; keyboard navigation check.

## 14. Build phases

Each phase gets its own implementation plan.

1. **Shell** — Next.js scaffold, quality gates (`pnpm check`: typecheck, lint,
   format, tests, and the file-size check from `AGENTS.md`, wired into a
   pre-commit hook), design system + `/design`, auth (Tailscale +
   passkey), app layout and navigation, Today with placeholder data, SQLite +
   migrations, systemd units, Tailscale Serve setup script.
2. **Second Brain** — viewer, search, links, frontmatter; agent runner; research
   sprint and product discovery runs; Settings approval of keywords/questions/
   competitors.
3. **Daily scan** — worker, job queue, scheduler; collectors in order: crawler,
   readiness, search-console, pagespeed, rankings, aeo-serp, ai-engines; scoring;
   Product pages.
4. **Weekly analyst + Actions** — rule-based actions, weekly analyst agent,
   actions board, Hand to Claude.
5. **Operations** — nightly backups, observation retention, monthly research
   refresh, cost ledger and budget guard (with the Today cost meter), Settings.

## 15. Open items for implementation planning

- Confirm current API products and pricing: DataForSEO SERP/AI Overview
  endpoints, OpenAI web search, Perplexity Sonar, Gemini grounding, Claude web
  search.
- Confirm exact `claude -p` flags for allowed tools, working directory and turn
  limits in the installed Claude Code version.
- Confirm Tailscale Serve identity header names on the installed version.
- Next.js version and WebAuthn library choice (e.g. SimpleWebAuthn).
