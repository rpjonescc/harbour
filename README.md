# Harbour

A calm, private, self-hosted control centre for your own projects. Harbour runs on an
always-on machine at home, is reachable only over your Tailscale network, and opens only
with a passkey.

The secure shell, design system, Second Brain viewer, agents, the daily visibility scan, the
Actions board and the weekly AI analyst are built. The scan measures how findable each product is in classic search (SEO), in AI assistants
(GEO) and as direct answers (AEO), scored 0–100 with explainable breakdowns. The roadmap
continues with:

- **Paid sources** — AI engine mentions and citations, keyword rankings and featured snippets
  (they need API keys, so they show as "not connected" for now).
- **Plain-language UX** (in progress) — every screen says what something is, why it matters
  and what to do, in plain words; technical detail stays one click away
  ([spec](docs/superpowers/specs/2026-10-02-plain-language-ux-design.md)).
- **Content machine** (idea) — content pillars, drafts, atomising and quality passes before
  anything is published ([idea note](docs/superpowers/ideas/2026-10-02-content-machine.md)).

## Features

- **Today** — date, when your sites were last checked, a one-sentence briefing (overall health
  and the biggest opportunity, then how many things are worth doing, how many Claude is
  handling and anything broken: a check that didn't finish, a failing data source or a backup
  that needs a look), a plain verdict per product and area (Found on Google, Recommended by
  AI assistants, Answer-ready: Strong 85+, Good 70–84, Fair 50–69 or
  Needs work under 50, with the score and its change beside it; "What's this?" explains each
  area, and the numbers with a 30-day SEO trend sit under Technical details), **Worth doing
  next** (the top three actions as plain cards: why each matters, its area, how big a job it
  is and who's on it), and **Behind the scenes**: paid spend, backup warnings and any data
  source that failed in the last check, each saying what happened, whether it matters and what
  to do (raw errors under Technical details). Until the first scan finishes it shows clearly
  labelled sample data.
- **Product pages** — per product: the three scores, **Scan now**, SEO/GEO/AEO tabs explaining
  every sub-score (its weight, evidence, or why it is missing), the issues the scan found with
  a **Hand to Claude** button that copies a ready prompt, the crawled pages and their problems,
  and Search Console clicks, impressions and top queries.
- **Actions board** — every issue the scan finds becomes a tracked action, grouped as Big wins,
  Worth doing and Small wins. Each card is a headline, one line on why it matters, a chip for how big a win it is
  (Big win, Worth doing, Small win) and a chip for who's on it (a new idea not decided yet,
  Claude is on it, a pull request waiting for your OK, or waiting for you), with the area, how big
  a job it is (a quick job, an afternoon or a project) and the product in one small line, and
  a link to its pull request. The full reason, evidence, where it came from, the exact fix and
  check, and **Hand to Claude** (a ready prompt) sit under **Technical details**. Filter by product, area and status (a plain,
  bookmarkable form); move an action through New ideas → To do → In progress → Done, snooze it
  until a date or dismiss it. The sidebar shows how many are open. Claude can triage the board
  for you with `pnpm actions`, every change recorded with its reason.
- **Sources** — whether the daily scan is on, which data sources are connected (never their
  secrets), and each source's last run, status and reason per product.
- **Products from config** — list your products in `harbour.config.json`; each gets a
  colour from a six-hue palette. Without it, a clearly labelled demo config is shown.
- **Devices** — add a passkey to a new device with a one-time link, see local sign-in times
  and which device you are using, or remove a lost one. Reused device names get a number.
- **Second Brain** — read Markdown notes with a document tree, frontmatter, links and backlinks.
- **Agents** — research and discovery agents that write into the Second Brain, one at a time,
  with live activity, cancel, and automatic save and sync; stale research is re-checked monthly
  (see [Research refresh](#research-refresh)).
- **Cost meter** — Today shows this month's paid API spend against your monthly budget, with a
  month-end projection, a warning at 80 % and a pause at 100 %. No paid source exists yet, so it
  says "No paid data connected" (see [Costs and budget](#costs-and-budget)).
- **Design system** — "Paper & Tide" tokens (primitives → semantic) in light and dark, with
  a living reference at `/design` showing every component in its main states.
- **Nightly backups** — a verified copy of the database every night at 03:15, the newest 14
  kept, with retries and a catch-up after downtime (see [Backups and restore](#backups-and-restore)).
  Today warns when the last backup failed with no retry left, when there has been none for
  2 days, or when Harbour can't read the backup folder.
- **Settings** — one read-only page showing what Harbour is set up to do: products, schedules
  and their next runs, whether each API key is set (never its value), the budget and this
  month's spend, backup health with **Back up now**, and links to the other settings pages.
  Values are changed in `.env` and `harbour.config.json`.
- **Accessible by default** — keyboard paths, visible focus, accessible names, rem-based type.

### Pages

| Path | What it shows |
|---|---|
| `/` | Today |
| `/products/<id>` | A product's scores, issues, pages and sources |
| `/actions` | Actions board (`?product=<id>&area=SEO\|GEO\|AEO&status=active\|suggested\|snoozed\|done\|dismissed\|all`; the status values are the stored ones, which the board shows as New ideas (`suggested`), To do (`open`), In progress, Done, Snoozed and Dismissed) |
| `/settings` | Settings overview: products, schedules, key status, budget and backups |
| `/settings/products/<id>` | A product's research targets (keywords, AI questions, competitors) |
| `/settings/sources` | Scan schedule, connections and each source's last run |
| `/brain` | Second Brain |
| `/agents` | Agent runs |
| `/settings/devices` | Passkeys and devices |
| `/design` | Design system reference |

Four JSON endpoints change things; like every mutating route they take same-origin JSON from a
signed-in session:

- `POST /api/scans` with `{"productId": "<id>"}` queues a scan for the worker (as **Scan now**
  does).
- `POST /api/backups` with an empty body `{}` queues a backup of today for the worker (as
  **Back up now** on Settings does), even when the nightly backup is off. It answers
  `{"jobId": 12, "created": true}` (`created: false` when one is already queued or running) and
  is written to the audit log.
- `POST /api/agents/run` queues agent runs (as the buttons on **Agents** do), for example
  `{"kind": "refresh"}` to refresh up to 3 stale research documents. It answers
  `{"jobIds": [...], "stale": 4}` (an empty list when nothing is stale) and refuses with
  `409 token_missing` while `HARBOUR_CLAUDE_OAUTH_TOKEN` is not set.
- `POST /api/actions/<id>` with `{"from": "open", "to": "snoozed", "until": "2026-11-01"}`
  moves an action to a new status. `from` is the status your page showed: if the action changed
  since, the request is refused (`409 stale`) instead of overwriting it. `to` is `open`,
  `in_progress`, `done`, `snoozed` (with an `until` date, at most a year ahead) or `dismissed`;
  an optional `note` (up to 500 characters) goes into the action's history. Each change is
  written to the audit log, without the note.

## Second Brain

Harbour reads Markdown files from `HARBOUR_BRAIN_DIR`. Open **Second Brain** in the sidebar or
visit `/brain`. The sidebar shows the number of new documents. The viewer has
a folder tree, a reading view with an outline, links between notes (`[[note-name]]` or
`[[note-name|label]]`), backlinks, and sources from frontmatter. Press **⌘K** or **Ctrl+K** to
search titles and document text. New and changed notes are marked
until you open them. If `00-start-here.md` exists, it opens at `/brain`; otherwise, the page lists
recently changed documents. The tree lists up to 5,000 documents. Hidden files and folders,
symlinks, and documents larger than 2 MB are not shown or searched.

Keep the brain in its own **private** git repository. It holds research and plans that must never
be committed to this public repo. Optional frontmatter looks like this:

```yaml
---
title: How AI engines pick their sources
tags: [geo]
researched: 2026-10-01
confidence: medium
review_by: 2027-01-01
sources: [https://example.com/article]
---
```

`sources` accepts only `http` and `https` URLs; anything else is reported as invalid frontmatter.

Set `HARBOUR_EDITOR_URL_TEMPLATE` to a URL containing `{path}` to open a document in an editor.
Its default is `vscode://file/{path}`; an empty value hides the link.

## Agents

Open **Agents** in the sidebar (`/agents`) to run research and discovery agents that write into
your Second Brain:

- **Research** — one run per topic (SEO, GEO, AEO, a glossary, a start-here guide and a scoring
  rationale), or **Run all research topics** to queue them all (a topic that already has a
  research run or refresh queued or running keeps that run). Each writes one document under
  `research/` (or `00-start-here.md`).
- **Discovery** — one run per product; it reads your `products/<id>/notes.md` and writes
  `products/<id>/discovery.md` and `products/<id>/proposals.json`.

Agents run Claude Code on the Harbour PC with your Claude subscription. Run
`claude setup-token` there, add `HARBOUR_CLAUDE_OAUTH_TOKEN=…` to `.env`, then restart both
services (`systemctl --user restart harbour-web harbour-worker`) — also after changing the token.
The worker reads the token to run agents; the web only checks whether it is set, and keeps the
run buttons disabled until it is. Agents only have web research (search and
fetch) and file tools limited to the brain directory: no shell, no hooks, no MCP servers.

The **git gate** checks every run: a run may change only its own target files (Markdown, plus
`proposals.json` for discovery and the weekly analyst). Any other change fails the run, and everything the agent changed
is moved to quarantine and restored from git. An attempt to write outside the brain fails the run
too, even though Claude Code denies the write; the error names the path it tried. The gate knows
which files the agent wrote (every write it makes is listed in its output), so you can keep
editing the brain while a run is going: your edits are never committed with the agent's work or
discarded with it — they stay in place and are saved automatically as usual. A file both of you
edited counts as the agent's. Only one agent runs at a time; queued runs wait their turn. Each run
has a live activity page with a **Cancel** button, and lists the files it changed. Without a
Claude token the server refuses new agent runs.

Discovery results are proposals, not commitments. Open a product in the sidebar and choose
**Research targets** (`/settings/products/<id>`) to see its proposed keywords, AI questions and
competitors, each with the agent's reason. **Approve**, **Reject** or **Edit** each one, or **Approve all proposed** per
list. Re-running discovery never overwrites items you've already decided on.

Saving and syncing need no action. The Agents page and the Second Brain show unsaved notes
("saved automatically in about 2 minutes") and commits waiting to sync to GitHub ("retrying
automatically"); **Save now** and **Retry now** are optional shortcuts. While an interrupted run
is being recovered, a banner says so and autosave is paused.

### Weekly analyst

The weekly analyst is an agent that turns the week's data into a report and suggested actions.
It runs as a `weekly-analyst` job for one ISO week (for example `2026-W40`), on the same runner,
git gate and Claude subscription as the other agents (no paid API calls).

- **What it reads** — a JSON export of the last 7 days that Harbour embeds in its prompt: each
  product's scores and their change over the week, the latest sub-scores, issues, collector
  results and Search Console totals, competitors you approved or that were proposed, and your
  open and suggested actions. Missing data stays `null` (a gap, never a zero). The export holds no
  secrets, and is capped at 48 KiB: when it is bigger, the least useful details are cut first and
  the cuts are listed in its `truncated` field. The agent also reads your research documents,
  your product notes and the previous weekly report, without changing them.
- **What it writes** — exactly two files: `reports/weekly/<week>.md` (where we stand, what
  improved, what got worse, top opportunities, competitors seen and data gaps) and
  `reports/weekly/<week>.proposals.json` (at most 10 suggested actions). Anything else fails the
  run, and a run that skips either file or writes an invalid proposals file is discarded with
  nothing imported. If importing fails after the files are committed (or the worker stops in
  between), the worker imports them from that commit automatically, at most 3 attempts in all,
  and never twice; each failure is listed on the run's activity page.
- **Where suggestions appear** — on the **Actions** board as **New ideas** (`/actions`), labelled
  as coming from the weekly analyst; accept or dismiss each one. An action the product already
  has (a new idea, to do, in progress, snoozed or dismissed) is not suggested again.
- **When it runs** — every Sunday at 20:00 in `HARBOUR_TIMEZONE`, for that week (see
  [When things run](#when-things-run)). The **Weekly report** panel on **Agents** shows the next
  scheduled run (or that a run is queued or running, that a catch-up is due, or that scheduled
  runs are off or need a Claude token) and links the latest report; **Run weekly report now** (or `pnpm analyst:now`)
  queues a run for the current week straight away. A run whose suggestions could not be imported
  after 3 attempts says "Suggestions not imported — run the agent again" in **Recent runs**.

### Research refresh

Research goes out of date, so once a month Harbour re-checks the oldest documents. A refresh is a
research run of the same topic, with the same rules and git gate: the agent reads the existing
document, re-checks its claims and sources, keeps what still holds, corrects what changed, adds
what is new, sets `researched` to today and `review_by` 90 days later, and ends with a section
"What changed in this refresh". It may change only that one document.

- **What is due** — a document whose `researched` date is more than 30 days old, or has no
  readable `researched` date ("date unknown"; a date more than a day in the future counts as
  unreadable and shows as "date in the future"). This is earlier than the viewer's **stale** badge,
  which appears only after `review_by`. Documents not written yet are never refreshed: run the
  research sprint for them.
- **How many** — at most 3 per round, oldest first (unknown dates count as oldest). A topic that
  already has a research run queued or running is skipped. With 10 topics that means each one is
  refreshed every few months, not every month.
- **When** — on the first Sunday of each month at 21:00 in `HARBOUR_TIMEZONE` (see
  [When things run](#when-things-run)), and whenever you choose **Refresh stale research** on
  **Agents**. The **Research refresh** panel there shows the next scheduled refresh, which
  documents are due (with their dates) and how many are not written yet.

### Install as an app

Harbour can be installed like an app, with its own window and icon. In Chrome or Edge, open
Harbour and choose **Install Harbour** from the address bar or menu; on Android choose
**Add to Home screen**; on iPhone and iPad use **Share → Add to Home Screen**. Harbour needs
a live connection to your PC, so it has no offline mode.

## Security model

Harbour is built to be safe to leave running:

- **Loopback only.** The web server binds `127.0.0.1:3400`; nothing on your LAN can reach it.
- **Lock 1 — Tailscale identity.** Tailscale Serve publishes Harbour over HTTPS to your
  tailnet and adds the `Tailscale-User-Login` header. Requests whose login is not on
  `HARBOUR_ALLOWED_LOGINS` are rejected with 403.
- **Lock 2 — passkey.** Every session starts with a WebAuthn passkey (user verification
  required). Passkeys are registered only through single-use, short-lived setup tokens.
- **Sessions** are random 32-byte tokens stored as SHA-256 hashes, bound to the Tailscale
  login, with a sliding 30-day expiry and `HttpOnly; Secure; SameSite=Strict` cookies.
- **Nonce-based CSP** on every response, strict security headers, no third-party scripts,
  self-hosted fonts, and same-origin JSON-only mutating routes.
- **Audit log** of sign-ins (including failures), passkey changes and setup links.

See [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · SQLite with
Drizzle ORM · SimpleWebAuthn · zod · Vitest · Playwright · Biome · lefthook · pnpm · Node 22.

## Quick start (development)

Requires Node 22.1+ and pnpm 9.

```bash
git clone https://github.com/rpjonescc/harbour && cd harbour
pnpm install
cp .env.example .env
```

For local development, set these in `.env`:

```bash
HARBOUR_ALLOWED_LOGINS=you@example.com
HARBOUR_ORIGIN=http://localhost:3400
HARBOUR_RP_ID=localhost
```

Then create `.env.development.local` (loaded only by `next dev`) so you do not need
Tailscale locally:

```bash
HARBOUR_DEV_IDENTITY=you@example.com
```

Optionally list your own products (otherwise the demo config is used):

```bash
cp harbour.config.example.json harbour.config.json   # then edit
```

Harbour reads `harbour.config.json` once at startup, so restart it after editing
(`systemctl --user restart harbour-web` for a deployed install).

Start the app and register your first passkey:

```bash
pnpm dev            # http://localhost:3400
pnpm setup-token    # prints a one-time link; open it to create a passkey
pnpm worker         # runs queued jobs (agents, scans, backups, retention), one at a time (reads .env)
pnpm agents:initial-run  # once: queues every research topic, then discovery per product
pnpm scan:now       # queues a visibility scan of every product now (or: pnpm scan:now <productId>)
pnpm analyst:now    # queues the weekly analyst report for the current week now
pnpm backup:now     # queues a backup of the database now (see "Backups and restore")
pnpm retention:check  # read-only: what the next retention run would delete (see "Data kept")
pnpm gsc:connect    # signs in with Google to connect Search Console (see "Connect Search Console")
pnpm actions list   # lists and triages actions from a terminal (see "Let Claude triage the board")
```

A deployed install runs the worker as the `harbour-worker` systemd user service (see
`deploy/README.md`).

The worker is the only process that runs agents or touches the brain's git history. Between
jobs it saves your own brain edits (commit + push) once they have been quiet for 2 minutes,
and retries unpushed commits from 10 minutes apart, backing off up to 6 hours while pushes
keep failing. Before each agent run your unsaved edits are committed on their own. Edits you
make in the brain *while* an agent runs are never lost: changes to the agent's own target
files are included in its commit; an edit anywhere else fails the run (the worker cannot
tell it from the agent's) and is moved, with the run's output, to `quarantine/job-<id>` (next
to the database). Files a failed or cancelled run leaves behind go there
too. If the worker stops mid-run, it recovers the run on restart the same way; until then
autosave and new agent runs wait. An agent run also waits (back in the queue, with a
"Waiting for the brain to be quiet" note) while anything in the brain changed in the last
3 minutes, so it never commits notes you are still writing.

Running it day to day:

- **Edit the brain only on the Harbour PC.** Harbour commits and pushes the brain but never
  pulls, so commits made elsewhere make its pushes fail until you reconcile them by hand.
- Give the brain a `.gitignore` for editor and OS files (`.DS_Store`, `*.swp`, `*~`,
  `.obsidian/workspace*.json`), so they are never saved as notes or mistaken for agent changes.
- **Update Harbour when the Agents page is idle** (no run queued or running): restarting the
  worker cancels a running agent and moves its work to quarantine.

## Configuration

All settings are environment variables, validated at startup.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `HARBOUR_ALLOWED_LOGINS` | yes | — | Comma-separated Tailscale logins allowed in. |
| `HARBOUR_ORIGIN` | yes | — | Public origin, e.g. `https://host.tailnet.ts.net:8444` (no path). |
| `HARBOUR_RP_ID` | yes | — | WebAuthn relying-party id: the origin's hostname or a parent domain. |
| `HARBOUR_DB_PATH` | no | `./data/harbour.db` | SQLite database file. |
| `HARBOUR_CONFIG_PATH` | no | unset | Product config file; must exist if set. Unset reads `./harbour.config.json` and shows the example (demo) only if that file does not exist. |
| `HARBOUR_TIMEZONE` | no | server's zone | IANA timezone for dates, the nightly backup at 03:15, the daily scan at 06:00 and the weekly analyst on Sundays at 20:00 local time (daylight saving included). |
| `HARBOUR_LOCALE` | no | `en-US` | BCP 47 locale for dates. |
| `HARBOUR_BRAIN_DIR` | no | `./brain` | Second Brain directory — point it at a separate private repo. The worker refuses all git work unless it is the root of its own git repository. |
| `HARBOUR_EDITOR_URL_TEMPLATE` | no | `vscode://file/{path}` | Editor link for brain documents; `{path}` is the encoded absolute file path. Empty hides the link. |
| `HARBOUR_DEV_IDENTITY` | dev only | — | Stand-in Tailscale login for `next dev`; refused in production. |
| `HARBOUR_CLAUDE_OAUTH_TOKEN` | for agents | unset | Secret; from `claude setup-token`; required for agents. Used by the worker; the web only checks whether it is set. Never shown. Restart both services after changing it. |
| `HARBOUR_CLAUDE_BIN` | no | `claude` | Claude Code CLI executable the worker runs: a command on the worker's `PATH`, or an absolute path (e.g. `/opt/claude/bin/claude`). |
| `HARBOUR_AGENT_MODEL` | no | `claude-sonnet-5-5` | Full model id used for agent runs. |
| `HARBOUR_AGENT_TIMEOUT_MINUTES` | no | `30` | Maximum agent run length, 1 to 120 minutes. |
| `HARBOUR_CRAWL_MAX_PAGES` | no | `200` | Most pages the visibility scan's crawler fetches per product per scan, 1 to 500. The crawler stays on the product's origin, honours `robots.txt`, and fetches at most two pages at a time, at least 500 ms apart. |
| `HARBOUR_SCHEDULED_SCANS` | no | `on` | `off` stops the worker queueing scans by itself (the daily 06:00 scan and the catch-up on start); `pnpm scan:now` still queues them by hand. Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_ANALYST` | no | `on` | `off` stops the worker queueing the weekly analyst by itself (Sundays at 20:00 and the catch-up on start); **Run weekly report now** and `pnpm analyst:now` still queue it by hand. Restart the worker after changing it. |
| `HARBOUR_BACKUP_DIR` | no | `<folder of HARBOUR_DB_PATH>/backups` | Where the nightly backups go (see [Backups and restore](#backups-and-restore)). Use a dedicated folder: old backups are pruned from it by name, so `/`, your home folder and the temp folder are refused, as is anything inside `HARBOUR_BRAIN_DIR` (also through a symlink), because the brain is pushed to a remote. Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_RESEARCH` | no | `on` | `off` stops the worker queueing the monthly research refresh by itself (the first Sunday of each month at 21:00 and the catch-up on start); **Refresh stale research** on **Agents** still queues it by hand. Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_BACKUP` | no | `on` | `off` stops the worker queueing the nightly backup by itself (03:15 and the catch-up on start); `pnpm backup:now` still queues one by hand. Restart the worker after changing it. |
| `HARBOUR_OBSERVATION_SCANS_KEPT` | no | `30` | How many of each product's newest scans keep their raw observations (7 to 365); older scans' observations are deleted after each verified backup (see [Data kept](#data-kept)). Scores and scan history are always kept. Restart the worker after changing it. |
| `HARBOUR_PAGESPEED_API_KEY` | for PageSpeed | unset | Secret; a Google Cloud API key restricted to the PageSpeed Insights API (see [Connect PageSpeed](#connect-pagespeed)). Once a week per product the scan asks PageSpeed Insights for mobile performance and Core Web Vitals (this sends the product URL to Google). Without a key PageSpeed shows as not connected: Google gives keyless requests no quota. Used by the worker only; never logged, shown or stored with results. Restart the worker after changing it. |
| `HARBOUR_GSC_CREDENTIALS` | for Search Console | unset | Absolute path to a Google credentials JSON file — a service account key or an OAuth authorized-user file (see [Connect Search Console](#connect-search-console)). Keep it outside the repo with mode 600; Harbour warns in the scan if other users can read it. Read by the worker only; its contents and the access tokens are never logged, shown or stored. Restart the worker after changing it. |
| `HARBOUR_MONTHLY_BUDGET_AUD` | no | `0` | Monthly cap on paid API spend in Australian dollars, 0 to 10000 in whole cents (e.g. `60` or `12.50`). `0` means no paid calls at all. See [Costs and budget](#costs-and-budget). Restart both services after changing it. |
| `HARBOUR_DATAFORSEO_LOGIN` | no | unset | Not used yet — reserved for the DataForSEO login of the future rankings and SERP collectors. Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_DATAFORSEO_PASSWORD` | no | unset | Not used yet — reserved for the DataForSEO password of the future rankings and SERP collectors. Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_OPENAI_API_KEY` | no | unset | Not used yet — reserved for the future AI-engines collector (ChatGPT search). Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_PERPLEXITY_API_KEY` | no | unset | Not used yet — reserved for the future AI-engines collector (Perplexity Sonar). Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_GEMINI_API_KEY` | no | unset | Not used yet — reserved for the future AI-engines collector (Gemini with Google grounding). Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_TEST_MODE` | tests only | `0` | `1` marks the end-to-end test environment (`pnpm test:e2e` sets it). Refused unless `HARBOUR_ORIGIN` is a loopback origin (`http://localhost`, `127.0.0.1` or `[::1]`), so a deployed Harbour cannot turn it on. Never set it yourself. |
| `HARBOUR_SCAN_ALLOW_LOOPBACK` | tests only | `0` | `1` lets scans reach `127.0.0.1` / `::1`, so the end-to-end tests can scan a local fixture site. Refused unless `HARBOUR_TEST_MODE=1`; private and tailnet addresses stay refused either way. Never set it yourself. |
| `HARBOUR_HTTPS_PORT` | no | `8444` | Shell variable for `deploy/install.sh` (Tailscale Serve HTTPS port); the app itself does not read it. |

`harbour.config.json` lists 1–12 products:

```json
{
  "products": [
    {
      "id": "acme-docs",
      "name": "Acme Docs",
      "url": "https://docs.example.com",
      "hue": "amber",
      "searchConsoleProperty": "sc-domain:docs.example.com"
    }
  ]
}
```

`id` is a unique lowercase slug, `url` is http(s), and `hue` is one of `amber`, `violet`,
`blue`, `green`, `rose` or `teal`. An invalid file stops Harbour with a readable error.

Optionally, `searchConsoleProperty` names the product's Google Search Console property, in
either form Search Console uses: a domain property (`"sc-domain:example.com"`) or a URL-prefix
property (`"https://www.example.com/"`, ending in `/`). Without it, Search Console data for that
product shows as not connected; see [Connect Search Console](#connect-search-console).

Your product config and Second Brain are personal data: both are gitignored, and the brain
belongs in its own private repository.

## When things run

### Nightly backup

The worker backs up the database each night at 03:15 in `HARBOUR_TIMEZONE` (see
[Backups and restore](#backups-and-restore)). Like the scans it is worked out from the job
history: a restart never queues it twice, and a worker that was down at 03:15 queues that
night's backup at its first check; one that was down for several nights queues only the latest
night's, never one per missed night. A failed backup is tried again 10 minutes later, then 40
minutes after that; after three failures the worker waits for the next night. A backup the
worker's own stop interrupts counts as a failed attempt and is retried the same way; one you
cancel on **Agents** stays cancelled until the next night. A backup you queue by hand
(`pnpm backup:now`) counts as that day's. Set `HARBOUR_SCHEDULED_BACKUP=off` to
back up only by hand. The worker's start-up line says when the next backup is due. Each
verified backup then queues a retention job that prunes old scan observations (see
[Data kept](#data-kept)).

### Daily scans

The worker queues a visibility scan of every product each day at 06:00 in `HARBOUR_TIMEZONE`.
If the worker is down at 06:00, it queues the day's scans at its first check after it starts.
On start it also catches up: any product without a successful (or partly successful) scan in
the last 24 hours is scanned straight away. A product never has more than one scan queued or
running, and the daily scan is queued once a day however often the worker restarts. A daily
scan that fails or that you cancel still counts as that day's: the next try is the following
day at 06:00, or the catch-up when the worker next starts. A catch-up that runs before 06:00
is still followed by that day's 06:00 scan. Set `HARBOUR_SCHEDULED_SCANS=off` to queue scans
only by hand.

Scans are ordinary jobs: they run one at a time, in queue order, between agent runs. Unlike
agent runs they never wait for the brain to be quiet, because they don't touch it. To scan
now, choose **Scan now** on the product's page, or run `pnpm scan:now` (every product) or
`pnpm scan:now <productId>`; an unknown id is rejected with the configured ones. Both services
read `harbour.config.json` once, so after changing it restart them
(`systemctl --user restart harbour-worker harbour-web`) before scanning. The **Sources** page shows whether the daily scan is on and when each
product was last scanned and will be next.

### Weekly analyst

The worker queues one weekly analyst run (see [Weekly analyst](#weekly-analyst)) each Sunday at
20:00 in `HARBOUR_TIMEZONE`, for that Sunday's ISO week. Like the daily scan it is worked out from
the job history, so a restart never queues it twice, and a worker that was down on Sunday evening
queues exactly one run, for that Sunday's week, when it starts. A run you start by hand counts
only if you start it after Sunday's 20:00: one earlier in the week does not stop the full-week
report. The worker skips the week, and says so in its log, when `HARBOUR_CLAUDE_OAUTH_TOKEN` is
not set ("weekly analyst skipped: no Claude token") or when no product has a scored scan in the
last 7 days ("no scan data this week"). A failed run is not retried automatically: choose **Run
weekly report now** on **Agents** or run `pnpm analyst:now`. Set `HARBOUR_SCHEDULED_ANALYST=off` to
run it only by hand. Like every agent run it waits for the brain to be quiet first.

### Monthly research refresh

On the first Sunday of each month at 21:00 in `HARBOUR_TIMEZONE` (an hour after the weekly
analyst, so that runs first) the worker queues refreshes of up to 3 stale research documents (see
[Research refresh](#research-refresh)). Each refresh job is labelled with its month, which is how
the worker knows the month's round has run: a restart never queues it twice, a worker that was
down over the slot queues one round, for the latest month, when it starts, and a round whose
refreshes failed is not retried until the next month (choose **Refresh stale research** on
**Agents** to retry by hand). When nothing is stale it logs "research refresh: nothing stale for
2026-10" and queues nothing. It also queues nothing, and says so once in its log, when
`HARBOUR_CLAUDE_OAUTH_TOKEN` is not set or the brain folder is missing. Set
`HARBOUR_SCHEDULED_RESEARCH=off` to refresh only by hand. Like every agent run, refreshes wait for
the brain to be quiet first.

### Snoozed actions

Every 30 seconds between jobs the worker reopens snoozed actions whose date has come (in
`HARBOUR_TIMEZONE`), with the note "Snooze ended".

## Backups and restore

Each backup is a full copy of the SQLite database, taken while Harbour keeps running (SQLite's
online backup: the web stays usable throughout). Before it is kept, the copy is switched to a
single self-contained file and checked with SQLite's `integrity_check`; a copy that fails is
thrown away and the job fails with the reason (see **Agents**). Details:

- **Where:** `HARBOUR_BACKUP_DIR` (a folder used only for backups), by default a `backups`
  folder next to the database (`data/backups`, inside the gitignored data folder). Files are named by local day,
  `harbour-YYYY-MM-DD.db`; a second backup on the same day replaces the first.
- **How many:** the newest 14 are kept. Pruning only ever deletes regular files named exactly
  like a backup (never through a symlink, never the backup just written), plus unfinished
  `.partial` copies of a failed run; anything else in the folder is left alone.
- **Private:** backups are written with mode 600 in a folder with mode 700. They hold session
  hashes and the audit log, so **treat them like `.env`**: Harbour never sends them anywhere.
  Copying them off the machine (an encrypted disk, another host) is up to you, and is what
  protects you from losing the disk.
- **Now:** **Back up now** on Settings (or `pnpm backup:now`) queues a backup of today; the
  worker runs it next. It works even when `HARBOUR_SCHEDULED_BACKUP=off`. The Agents page
  shows it as "Nightly backup: YYYY-MM-DD" with the size and how many backups are kept.
- **Health:** the Backups section of **Settings** shows the last backup (time and size), how
  many are kept, the last failure (an attempt cut short by stopping the worker counts) and what
  retention last removed. Today shows a notice when the last backup failed and no retry is left
  (or it was a manual one): it names when it failed and either when Harbour tries again or, with
  nightly backups off, to run **Back up now**. It also warns when no backup is newer than 48
  hours (with none at all, once Harbour has been running for 48 hours; a failure that old means
  the worker is not running), and when Harbour can't read the backup folder (check its
  permissions; the count is then unknown, not zero). Paths are never shown: an error names "the
  backup folder" instead.
- **Bounded:** a backup gives up after 10 minutes. **Cancel** on **Agents** stops one in progress
  and removes the unfinished copy.

To restore one:

1. Stop both services: `systemctl --user stop harbour-worker harbour-web`.
2. Copy the chosen `harbour-YYYY-MM-DD.db` over the database file (`HARBOUR_DB_PATH`, by default
   `data/harbour.db`).
3. Delete the old `harbour.db-wal` and `harbour.db-shm` files next to it, if they exist: they
   belong to the database you replaced.
4. Start the web, then the worker: `systemctl --user start harbour-web`, then
   `systemctl --user start harbour-worker`.

### Data kept

Raw observations (every page, robots.txt and PageSpeed record a scan stores) are most of the
database: a crawl alone stores up to 200 page records per product per day. After each verified
backup the worker runs a retention job that deletes the observations of old scans, so the file
stops growing. For each product (configured or not) it keeps:

- the observations of the newest `HARBOUR_OBSERVATION_SCANS_KEPT` scans (default 30, whatever
  their outcome) and of any scan still running;
- the observations of each source's latest successful run, however old, so a weekly result
  such as PageSpeed still counts in later scores (only sources Harbour still has: a removed
  source's last run is pruned like any other old scan);
- the observations of the scan behind the latest scores, which the product page and the
  weekly export read.

Nothing else is ever pruned: scan runs, collector runs (with how many records each stored) and
scores stay complete, so score history, trends and **Sources** never change, and nor do job
history, agent runs, actions or the audit log. A run deletes at most 2,000 rows per statement,
each statement its own short transaction so the web never waits long, and at most 500,000 rows
(from at most 500 scans) per night; the rest goes after the next night's backup. The job's
events on **Agents** say how many observations it removed per product.

Deleted space is reused by later scans rather than returned to the disk: Harbour never runs
`VACUUM`, which rewrites the whole file and blocks the web while it runs. If you lower
`HARBOUR_OBSERVATION_SCANS_KEPT` a lot and want the space back, stop both services
(`systemctl --user stop harbour-worker harbour-web`), run `sqlite3 data/harbour.db 'VACUUM'`
(your `HARBOUR_DB_PATH`), then start the web and the worker again.

To see what the next run would delete without changing anything, run `pnpm retention:check`.
It opens the database read-only and prints, per product, the old scans and observation count
to remove, the totals, and the row counts of `observations`, `jobs` and `agent_run_events`
(job history is kept; it grows by a few rows a day). Run it as the user that runs Harbour: even
a read-only SQLite connection needs write access to the data folder for the database's `-shm`
and `-wal` files, and it says so if it cannot open the database.

## Costs and budget

Some data Harbour plans to collect comes from paid APIs (DataForSEO for rankings and AI
Overviews; OpenAI, Perplexity and Gemini for AI answers). None of those collectors exists yet,
so today Harbour makes **no paid calls**. The guard below is in place so the first one can only
spend what you allow.

- **The ledger.** Every paid call writes one row to the `costs` table: provider, collector,
  product, units billed and the amount. Amounts are stored as whole **micro-AUD** (1 AUD =
  1,000,000), because a single search request costs a fraction of a cent and whole cents would
  round it to zero. A row above A$100 is refused as a pricing bug and fails that collector.
- **The budget.** `HARBOUR_MONTHLY_BUDGET_AUD` caps the spend per calendar month in
  `HARBOUR_TIMEZONE`. It defaults to **0, which means no paid calls at all**: set it (e.g.
  `HARBOUR_MONTHLY_BUDGET_AUD=60`) to allow them. A paid collector asks the budget before every
  call, and a call is only made if its price fits what is left this month. That estimate is
  written to the ledger as a *reservation* before the call and replaced by the actual price
  after it, so two calls can never both use the last of the budget. If Harbour stops mid-call
  or the collector fails after the budget allowed a call,
  the reservation stays counted (the call may have been billed) and the meter shows it as
  "unconfirmed".
- **At 80 %** Today's meter shows a warning tag.
- **At 100 %** paid collectors are skipped until the 1st of next month (the scan records them as
  "skipped — budget: …"). Free collectors, agents and everything else keep running.

The meter on **Today** says one of the lines below. Amounts follow `HARBOUR_LOCALE`'s currency
style: `A$12.40` in `en-GB` or `en-US`, `$12.40` in `en-AU`.

| Meter | Meaning |
|---|---|
| No paid data connected — Harbour is using free data only, so nothing is being spent | No paid collector exists (or its keys are missing). With spend earlier this month it reads "No paid data connected · A$1.23 spent this month". |
| Paid data is off until you set a monthly budget — how to set one | A paid source is connected but the budget is 0. |
| A$12.40 of A$60.00 this month · on track for A$31.00 | Spend so far, the budget and a straight-line month-end projection (from the second day of the month). |
| … with "80 % of budget" | You have used at least 80 % of the budget. |
| Budget reached — paid data is paused until 1 Nov. Free checks carry on as normal. | Paid collectors are skipped until the next month starts. |

## Reading the results

- **Today** (`/`) gives every product a verdict per area. A missing score reads "No score yet"
  with the reason (a gap, never a zero); an asterisk marks a verdict where some data was
  missing because a source was not connected or failed, and the numbers are under **Technical
  details**. Each product name opens its page. While a scan is queued or running, the page
  refreshes itself. **Worth doing next** shows the top three open or in-progress actions (in
  the Actions board's order), each linked to its card and saying who's on it (Claude is on it,
  Pull request waiting for your OK, or Waiting for you), and the briefing's second line counts
  every one of them; the rest are a link away on the Actions board. Before the first scan is
  scored, Today shows clearly flagged sample data instead.
- **Product page** (`/products/<id>`) shows where scanning stands (never scanned, queued,
  running, or how the last scan ended — a failed scan never hides the last good results) and
  explains each score in its tab. **Issues** come from the scan's raw observations: pages
  without a title or meta description, broken internal links, pages hidden by noindex, AI
  crawlers blocked in robots.txt, no llms.txt, no FAQ structured data and no Google Preferred
  Sources button. An issue is raised only from collectors that ran ok in that scan: when the
  crawler or readiness check failed, its issues are unknown rather than fixed. The same goes for
  a page check that found nothing on a partial crawl (stopped at its page or byte limit, or some
  pages could not be fetched or read). **Hand to Claude** copies a prompt with the product, the affected URLs, the
  problem, a suggested fix and an acceptance check, to paste into Claude Code in the site's
  repository; it contains only the product's name and URL and the scan's findings. Each issue
  also shows its action's status (to do, in progress, snoozed until a date, dismissed, or done
  but still found in the last scan) with a link to it on the Actions board; an issue with no
  action yet says tracking starts with the next scan. The
  **Pages** table lists the 50 crawled pages with the most problems.
- **Actions** (`/actions`) follow every scan that is not failed: each issue becomes one tracked
  action per product and rule. The next scan that no
  longer finds the issue marks its action done, with a dated note; if the issue comes back, or
  you marked an action done while the scan still finds it, the action reopens. A dismissed
  action stays dismissed while the issue persists and reopens only if the issue clears and
  later returns. A snoozed action stays snoozed until its date even while the issue persists,
  and is marked done if the issue clears. When a rule could not judge a scan (its collector
  failed, or the crawl was partial), its action is left exactly as it was: missing data never
  creates, resolves or reopens an action. The scan's job log ends with how many actions were
  new, resolved and reopened; if this step fails the job is marked failed with the reason, the
  scan and its scores are kept, and the next scan tries again; until it does, the Actions page
  says the list may be out of date, that the last scan finished but couldn't update the actions
  (with the time), and that the next scan tries again. Reasons are written in plain words;
  actions raised before a wording change keep the old text until the next scan refreshes them.
- **The Actions board** shows To do and In progress actions by default, grouped Big wins → Worth
  doing → Small wins, in-progress first, then the smallest effort. Filters (product, area,
  status) are a normal form, so a filtered view can be bookmarked; at most 200 actions are shown,
  with a count of the rest. Each card offers only the moves its status allows (**Start**,
  **Mark done**, **Snooze…** with a date from tomorrow to a year ahead, **Dismiss**, **Move back
  to To do**, **Bring back now**, **Restore to To do**; new ideas from the weekly analyst are
  **Accept**ed or **Dismiss**ed). **History** lists every change with who made it (**You**,
  **Claude**, **Harbour's scan**…) and its note; a card whose fix has a pull request links to it
  (**Pull request owner/repo#42**, in a new tab). **Hand to Claude** copies a prompt with the
  problem, evidence (fenced as data), fix and acceptance check, and sits under **Technical
  details** on each card, which remembers whether you opened it. When agents have proposed
  research targets, a link per product leads to its settings page to approve them.
- **Sources** (`/settings/sources`) shows each collector's latest run per product (ok, failed,
  not connected or skipped) with its reason, and whether PageSpeed and Search Console are
  connected — as connected or not, never the key or the credentials.

## Let Claude triage the board

`pnpm actions` lets Claude, running in a Claude Code session on the Harbour host, work the
Actions board as your expert: accept or dismiss suggestions, start, finish or snooze actions,
and link the pull request that fixes each one. Every change goes through the same rules as the
board's buttons and lands in the action's history as **Claude**, with the reason Claude gave, and
in the audit log (without the reason). You review the decisions on the board afterwards and can
reopen or move anything back. It is a tool run on the host, not a worker agent: the worker's
agents still only suggest.

```bash
pnpm actions list [--product <id>] [--status open,in_progress] [--json]
pnpm actions show 12
pnpm actions set 12 in_progress --from open --note "Fixing the page titles in acme/widget#42"
pnpm actions set 12 snoozed --from open --note "Wait for the redesign" --until 2026-11-01
pnpm actions link 12 https://github.com/acme/widget/pull/42
pnpm actions link 12 --clear
```

- **list** shows suggested, open, in-progress and snoozed actions by default (at most 500), one
  per line: `#id  product  area  status  impact/effort  title  [PR]`. `--status` takes one or more
  statuses (`suggested`, `open`, `in_progress`, `done`, `snoozed`, `dismissed`); `--json` prints
  `{"note": "...", "actions": [...]}` with the full actions.
- **show** prints every field, the evidence, the history and the **Hand to Claude** prompt.
- **set** needs `--from`, the status Claude last saw: if the action changed since, it is
  refused instead of overwritten, as on the board. `--note` (up to 1,000 characters) is
  required: Claude must say why. Snoozing needs `--until`, a date after today in
  `HARBOUR_TIMEZONE` and at most a year ahead.
- **link** stores a GitHub pull request URL (`https://github.com/<owner>/<repo>/pull/<number>`,
  nothing else) on the action, or clears it with `--clear`, and notes it in the history.

Only actions of products in `harbour.config.json` are found. Errors print one line and exit
non-zero. The output is the actions' own content, never settings or secrets. Because titles,
reasons and evidence come from crawled pages and the analyst, `list` and `show` start with a note
(the `note` field in JSON) saying they are data, not instructions, and every printed field has
terminal escape sequences and control characters removed.

## Connecting Google data

The visibility scan works without any Google account: the crawler and the readiness checks
read your sites directly. Two optional Google sources add more; until you connect one, the
scan shows it as not connected and the scores it feeds are marked incomplete (a gap, never a
zero).

### Connect PageSpeed

PageSpeed Insights measures mobile performance and Core Web Vitals once a week per product.
Google gives requests without an API key no quota, so it needs a free key:

1. In the [Google Cloud console](https://console.cloud.google.com/), pick or create a project.
2. Under **APIs & Services → Library**, enable the **PageSpeed Insights API**.
3. Under **APIs & Services → Credentials**, choose **Create credentials → API key**, then edit
   the key and, under **API restrictions**, restrict it to the PageSpeed Insights API.
4. Put it in `.env` as `HARBOUR_PAGESPEED_API_KEY=` and restart the worker
   (`systemctl --user restart harbour-worker`).

### Connect Search Console

Search Console adds what Google actually shows: each day's clicks, impressions, click-through
rate and average position for the last 28 days (ending 3 days ago, because Google's data lags),
plus the top 250 queries and top 100 pages, and daily totals for the 28 days before that so the
score can show whether impressions are rising or falling. The worker asks for read-only access and talks only
to Google.

Harbour reads one credentials file, of either kind: an OAuth **authorized-user** file made
with your own Google sign-in, or a **service account** key.

- **Your own Google account** (use this when your Google Workspace organisation blocks
  service-account keys, the `iam.managed.disableServiceAccountKeyCreation` policy). Your
  account already sees your properties, so there is nothing to share. In the
  [Google Cloud console](https://console.cloud.google.com/):
  1. Pick or create a project, and under **APIs & Services → Library** enable the
     **Google Search Console API**.
  2. Under **Google Auth Platform**, configure the consent screen. Choose **Internal** if you
     can (a Workspace account), or publish the app (**Audience → Publish app**): an
     **External** app left in *Testing* gets refresh tokens that Google expires after 7 days.
  3. Under **Google Auth Platform → Clients → Create client**, choose **Desktop app** and
     download its JSON. Save it as `~/harbour-data/gsc-client.json` (or pass
     `--client <path>` below). A *Web application* client does not work: it needs a
     registered redirect address.
  4. On the Harbour machine, run:
     ```bash
     pnpm gsc:connect                # options: --client <file> --out <file> --force
     ```
     It prints a Google sign-in link and tries to open it in your browser. Sign in, allow
     read-only Search Console access, and Google sends you back to a page Harbour serves on
     `127.0.0.1` for the next 5 minutes. Open the link in a browser on the Harbour machine; if
     Harbour runs on a headless server, first forward the port the link names from the
     computer you browse on (for a link with `127.0.0.1:41234`:
     `ssh -L 41234:127.0.0.1:41234 you@harbour.example.com`), then open it there. The
     command then lists the Search Console properties your account can read, flags any
     `searchConsoleProperty` in `harbour.config.json` that is not among them, and writes
     `~/harbour-data/gsc.json` (or `--out`) with mode 600. It never replaces an existing file
     unless you pass `--force`, and never prints the client secret or any token. It asks only
     for the read-only Search Console scope, and you can revoke it at any time at
     [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **A service account** (when your organisation allows key files; it can only read the
  properties you share with it). In the [Google Cloud console](https://console.cloud.google.com/):
  1. Enable the **Google Search Console API** as above.
  2. Under **IAM & Admin → Service accounts**, create a service account (it needs no roles).
     Open it, then **Keys → Add key → Create new key → JSON** downloads its key file.
  3. In [Search Console](https://search.google.com/search-console), for each property open
     **Settings → Users and permissions → Add user**, enter the service account's email
     (`client_email` in the key file, e.g. `harbour@your-project.iam.gserviceaccount.com`)
     and choose **Restricted** permission.

Then, on the Harbour machine:

1. Store the file outside the repo, readable only by you (`pnpm gsc:connect` has already
   done this for its own file):
   ```bash
   mkdir -p ~/harbour-data
   mv path/to/downloaded.json ~/harbour-data/gsc.json
   chmod 600 ~/harbour-data/gsc.json
   ```
2. In `.env`, set `HARBOUR_GSC_CREDENTIALS` to the file's absolute path; `.env` does not
   expand `~`, so use what `echo ~/harbour-data/gsc.json` prints.
3. In `harbour.config.json`, give each product its property as Search Console names it:
   `"searchConsoleProperty": "sc-domain:example.com"` for a domain property, or
   `"searchConsoleProperty": "https://www.example.com/"` for a URL-prefix property.
4. Restart the worker (`systemctl --user restart harbour-worker`). The next scan's job events
   show, for each product, either `Search Console: 27 days, 250 queries, 100 pages (2026-09-01
   to 2026-09-28); 28 days in the 28 before` followed by `Search Console: 406 observations`, or
   `Search Console: not connected — …` saying what is still missing, or
   `Search Console: failed — …` with the reason. "Search Console refused access" (HTTP 401 or
   403) means the property is not shared with the credential's account; "Search Console API is
   not enabled" means the Google Cloud project the credential belongs to has not enabled the
   Google Search Console API.

Never set `GOOGLE_SDK_NODE_LOGGING` for the worker: it makes Google's auth library log its
requests and responses, access tokens included.

## How scores work

After each scan Harbour turns the raw observations into three scores from 0 to 100: **SEO**
(classic search), **GEO** (being used and cited by AI assistants) and **AEO** (being the direct
answer). Each score is the weighted mean of its sub-scores, and every sub-score keeps the
evidence behind its number, so the product page can explain it.

| Score | Sub-score (weight) |
|---|---|
| SEO | Technical health (35%), indexability (25%), Core Web Vitals (20%), search impressions trend (20%) |
| GEO | AI crawler access (30%; AI search and answer agents count three times as much as training-only crawlers), llms.txt (15%), entity structured data (25%), citation-ready content (30%) |
| AEO | FAQ, HowTo and Q&A coverage (40%), concise answer blocks (35%), Preferred Sources readiness (25%) |

- **Missing data is a gap, never a zero.** When a source is not connected, failed, or returned
  data Harbour could not read, its sub-scores are left out, the rest are re-weighted, and the
  score is marked incomplete with the reason. A partly unknown input (a sitemap that could only
  partly be read, an unreadable robots.txt) also marks the score incomplete.
- **The search trend needs a baseline.** It compares average daily impressions with the 28
  days before (a day without impressions counts as zero), and has no verdict (an incomplete
  score) for a new property, under 100 earlier impressions, or earlier data that starts well
  into its window.
- **PageSpeed runs weekly.** On the days in between, Core Web Vitals use the last result while it
  is at most 14 days old, and say which day it is from.
- **AI engine mentions and featured snippets** are listed as not connected: they need paid APIs.
- **Scores never change after they are stored.** Each row records its formula version (`v1`);
  a formula change gets a new version rather than rewriting history.

The exact formulas, thresholds and rounding are in the Phase 3 plan's "As built — scoring" notes
([docs/superpowers/plans](docs/superpowers/plans/2026-10-02-phase-3-visibility.md)).

## Deployment

Harbour runs as a systemd user service behind Tailscale Serve on its own HTTPS port. See
[deploy/README.md](deploy/README.md) for installation, verifying both locks, updates and
recovery.

## Testing

```bash
pnpm check       # typecheck, lint + format, file-size limits, unit tests
pnpm test        # unit and component tests (Vitest)
pnpm test:e2e    # production build + Playwright, light and dark
```

`pnpm check:private` scans staged and working files for secrets (API keys, tokens, private
keys), real tailnet hostnames and home-directory paths, plus any words you list in a
gitignored `.private-terms` file (copy `.private-terms.example`). It runs on every commit,
and on every push — including pushes that change no files, and pushes of a branch you do not
have checked out — it also scans the full content of the commits being pushed: author,
committer, message and every added line (merges included), plus the messages of annotated
tags being pushed, so a value added and later removed is still caught. The push
checks run as lefthook scripts in `.lefthook/pre-push/` because lefthook skips pre-push
commands when no files differ; `scripts/test-pre-push.sh` proves this against a scratch
clone (it runs as part of `pnpm test`). The hooks require `.private-terms`; set
`HARBOUR_ALLOW_NO_PRIVATE_TERMS=1` to skip that deliberately. A plain `pnpm check:private`
only warns when the file is missing.

Before the first e2e run, install the browser once: `pnpm exec playwright install chromium`.

`pnpm test:e2e` first recreates a git-backed copy of the fixture brain (`data/e2e-brain`, with a
bare remote) and a fresh database under `data/e2e/`, then starts the web server on port 3401 and
the agent worker. The worker runs a fake Claude CLI (`tests/fixtures/fake-claude.mjs`), so agent
runs, commits, pushes and discovery approvals are tested end to end without a real token.

It also serves the fictional Acme Docs fixture site (`tests/fixtures/sites/acme-docs`) on
`http://127.0.0.1:3402` (keep ports 3401 and 3402 free), and the E2E product config
(`tests/fixtures/harbour.config.e2e.json`) points Acme Docs at it. Scheduled scans are off;
the scan specs choose **Scan now** and check the product page, Sources and Today on the real
results. Only this environment may scan a loopback address (`HARBOUR_TEST_MODE` and
`HARBOUR_SCAN_ALLOW_LOOPBACK`, both refused outside tests).

The shell and scans specs also check that Today speaks plainly: no SEO, GEO or AEO heading, and
no `HARBOUR_*` setting name or sub-score key outside **Technical details**
(`tests/e2e/plain-language.ts`).

The Playwright projects run in order — the shell and brain specs, then agents, scans, actions,
the weekly analyst and finally operations (Settings) — because each later one changes what the
earlier ones check. The actions specs seed a scored scan of the fictional Lighthouse Café and
two analyst suggestions through Harbour's own code (`tests/e2e/seed-actions.ts`), then work the
Actions board: filters, status changes, snooze, **Hand to Claude** (read back from the
clipboard), Today's top three, keyboard paths and both themes. The analyst specs choose **Run weekly report now** twice (the scheduled
analyst is off, `HARBOUR_SCHEDULED_ANALYST=off`): the first run commits the report and imports a
suggestion, the second finds it already known.

The operations specs (`tests/e2e/settings.spec.ts`) check the Settings page — products, every
schedule shown as off, key status without values, the A$0.00 budget — then choose **Back up
now** and **Refresh stale research**. Every schedule is off in this environment
(`HARBOUR_SCHEDULED_SCANS`, `_ANALYST`, `_RESEARCH` and `_BACKUP` all `off`), so only these
clicks queue work. `HARBOUR_BACKUP_DIR` is unset, so the backup lands in `data/e2e/backups`,
which each run recreates; the specs check its file and folder modes and that the retention job
follows.

## Project structure

```
app/          routes (thin: parse input, call lib/, render)
components/   UI components built on semantic tokens
design/       tokens.css (primitives + semantic) and the token list for /design
lib/          auth, agents, brain, config, costs (ledger, budget), db, jobs, ops (backups), products, security, formatting — logic + tests
worker/       the job worker (`pnpm worker`): agent runs, scans, backups, autosave and push retries
deploy/       systemd unit template, install script, deployment guide
drizzle/      SQL migrations
scripts/      repo checks and the setup-token, initial-run, scan-now, analyst-now, backup-now, retention-check, gsc-connect and actions CLIs
tests/        e2e specs and test helpers
docs/         design spec and implementation plans
```

## Design docs

The design spec lives in [docs/superpowers/specs](docs/superpowers/specs) and the Phase 1
implementation plan in [docs/superpowers/plans](docs/superpowers/plans). Contributor rules
are in [AGENTS.md](AGENTS.md).

## Licence

[MIT](LICENSE)
