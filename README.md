# Harbour

A calm, private, self-hosted control centre for your own projects. Harbour runs on an
always-on machine at home, is reachable only over your Tailscale network, and opens only
with a passkey.

The secure shell, design system, and Second Brain viewer are built. The roadmap continues with:

- **Daily visibility scan** — how findable each product is in classic search (SEO), in AI
  assistants (GEO) and as direct answers (AEO), scored 0–100 with explainable breakdowns.
- **Weekly AI analyst** — turns the week's data into a report and a prioritised action plan.

## Features

- **Today** — date, scan status, a score table per product with deltas and 30-day
  sparklines, and the actions worth your attention (sample data until the scan ships).
- **Products from config** — list your products in `harbour.config.json`; each gets a
  colour from a six-hue palette. Without it, a clearly labelled demo config is shown.
- **Devices** — add a passkey to a new device with a one-time link, see local sign-in times
  and which device you are using, or remove a lost one. Reused device names get a number.
- **Second Brain** — read Markdown notes with a document tree, frontmatter, links and backlinks.
- **Agents** — research and discovery agents that write into the Second Brain, one at a time,
  with live activity, cancel, and automatic save and sync.
- **Design system** — "Paper & Tide" tokens (primitives → semantic) in light and dark, with
  a living reference and Second Brain examples at `/design`.
- **Accessible by default** — keyboard paths, visible focus, accessible names, rem-based type.

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
  rationale), or **Run all research topics** to queue them all. Each writes one document under
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
`proposals.json` for discovery). Any other change fails the run, and everything the agent changed
is moved to quarantine and restored from git. An attempt to write outside the brain fails the run
too, even though Claude Code denies the write; the error names the path it tried. The gate knows
which files the agent wrote (every write it makes is listed in its output), so you can keep
editing the brain while a run is going: your edits are never committed with the agent's work or
discarded with it — they stay in place and are saved automatically as usual. A file both of you
edited counts as the agent's. Only one agent runs at a time; queued runs wait their turn. Each run
has a live activity page with a **Cancel** button, and lists the files it changed. Without a
Claude token the server refuses new agent runs.

Discovery results are proposals, not commitments. Open a product in the sidebar
(`/settings/products/<id>`) to see its proposed keywords, AI questions and competitors, each with
the agent's reason. **Approve**, **Reject** or **Edit** each one, or **Approve all proposed** per
list. Re-running discovery never overwrites items you've already decided on.

Saving and syncing need no action. The Agents page and the Second Brain show unsaved notes
("saved automatically in about 2 minutes") and commits waiting to sync to GitHub ("retrying
automatically"); **Save now** and **Retry now** are optional shortcuts. While an interrupted run
is being recovered, a banner says so and autosave is paused.

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

Requires Node 22+ and pnpm 9.

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
pnpm worker         # runs queued agent jobs, one at a time (reads .env)
pnpm agents:initial-run  # once: queues every research topic, then discovery per product
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
| `HARBOUR_TIMEZONE` | no | server's zone | IANA timezone for dates. |
| `HARBOUR_LOCALE` | no | `en-US` | BCP 47 locale for dates. |
| `HARBOUR_BRAIN_DIR` | no | `./brain` | Second Brain directory — point it at a separate private repo. The worker refuses all git work unless it is the root of its own git repository. |
| `HARBOUR_EDITOR_URL_TEMPLATE` | no | `vscode://file/{path}` | Editor link for brain documents; `{path}` is the encoded absolute file path. Empty hides the link. |
| `HARBOUR_DEV_IDENTITY` | dev only | — | Stand-in Tailscale login for `next dev`; refused in production. |
| `HARBOUR_CLAUDE_OAUTH_TOKEN` | for agents | unset | Secret; from `claude setup-token`; required for agents. Used by the worker; the web only checks whether it is set. Never shown. Restart both services after changing it. |
| `HARBOUR_CLAUDE_BIN` | no | `claude` | Claude Code CLI executable the worker runs: a command on the worker's `PATH`, or an absolute path (e.g. `/opt/claude/bin/claude`). |
| `HARBOUR_AGENT_MODEL` | no | `claude-sonnet-5-5` | Full model id used for agent runs. |
| `HARBOUR_AGENT_TIMEOUT_MINUTES` | no | `30` | Maximum agent run length, 1 to 120 minutes. |
| `HARBOUR_CRAWL_MAX_PAGES` | no | `200` | Most pages the visibility scan's crawler fetches per product per scan, 1 to 500. The crawler stays on the product's origin, honours `robots.txt`, and fetches at most two pages at a time, at least 500 ms apart. |
| `HARBOUR_PAGESPEED_API_KEY` | for PageSpeed | unset | Secret; a Google Cloud API key restricted to the PageSpeed Insights API (see [Connect PageSpeed](#connect-pagespeed)). Once a week per product the scan asks PageSpeed Insights for mobile performance and Core Web Vitals (this sends the product URL to Google). Without a key PageSpeed shows as not connected: Google gives keyless requests no quota. Used by the worker only; never logged, shown or stored with results. Restart the worker after changing it. |
| `HARBOUR_GSC_CREDENTIALS` | for Search Console | unset | Absolute path to a Google credentials JSON file — a service account key or an OAuth authorized-user file (see [Connect Search Console](#connect-search-console)). Keep it outside the repo with mode 600; Harbour warns in the scan if other users can read it. Read by the worker only; its contents and the access tokens are never logged, shown or stored. Restart the worker after changing it. |
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

Harbour reads one credentials file, of either kind. Use a service account unless you have a
reason not to: it can only read the properties you share with it.

- **A service account** (recommended). In the
  [Google Cloud console](https://console.cloud.google.com/):
  1. Pick or create a project, and under **APIs & Services → Library** enable the
     **Google Search Console API**.
  2. Under **IAM & Admin → Service accounts**, create a service account (it needs no roles).
     Open it, then **Keys → Add key → Create new key → JSON** downloads its key file.
  3. In [Search Console](https://search.google.com/search-console), for each property open
     **Settings → Users and permissions → Add user**, enter the service account's email
     (`client_email` in the key file, e.g. `harbour@your-project.iam.gserviceaccount.com`)
     and choose **Restricted** permission.
- **An OAuth desktop client** (uses your own Google account, which already sees your
  properties):
  1. Enable the **Google Search Console API** as above.
  2. Under **APIs & Services → OAuth consent screen**, configure the app and add yourself as a
     user; then under **Credentials → Create credentials → OAuth client ID** create a
     **Desktop app** client and download its JSON.
  3. Turn it into an authorized-user file with a refresh token, for example with the
     [gcloud CLI](https://cloud.google.com/sdk/docs/install), which insists on the
     `cloud-platform` scope alongside the one Harbour needs:
     `gcloud auth application-default login --client-id-file=client.json --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform`.
     It writes `application_default_credentials.json` (`"type": "authorized_user"`). Trade-off:
     that refresh token can then reach all of Google Cloud as you, not just Search Console
     (Harbour itself only ever asks for read-only Search Console access), so guard the file
     closely; this is why the service account is the better choice.
     While the consent screen's publishing status is *Testing*, Google expires the refresh
     token after 7 days; publish the app, or use a service account, for a lasting connection.

Then, on the Harbour machine:

1. Store the file outside the repo, readable only by you:
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
   to 2026-09-28)` followed by `Search Console: 378 observations`, or
   `Search Console: not connected — …` saying what is still missing, or
   `Search Console: failed — …` with the reason. "Search Console refused access" (HTTP 401 or
   403) means the property is not shared with the credential's account; "Search Console API is
   not enabled" means the Google Cloud project the credential belongs to has not enabled the
   Google Search Console API.

Never set `GOOGLE_SDK_NODE_LOGGING` for the worker: it makes Google's auth library log its
requests and responses, access tokens included.

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

## Project structure

```
app/          routes (thin: parse input, call lib/, render)
components/   UI components built on semantic tokens
design/       tokens.css (primitives + semantic) and the token list for /design
lib/          auth, agents, brain, config, db, jobs, products, security, formatting — logic + tests
worker/       the job worker (`pnpm worker`): agent runs, autosave and push retries
deploy/       systemd unit template, install script, deployment guide
drizzle/      SQL migrations
scripts/      repo checks and the setup-token CLI
tests/        e2e specs and test helpers
docs/         design spec and implementation plans
```

## Design docs

The design spec lives in [docs/superpowers/specs](docs/superpowers/specs) and the Phase 1
implementation plan in [docs/superpowers/plans](docs/superpowers/plans). Contributor rules
are in [AGENTS.md](AGENTS.md).

## Licence

[MIT](LICENSE)
