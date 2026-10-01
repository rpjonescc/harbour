# Harbour Phase 2 — Second Brain and Agents: Design Spec

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Refines:** `2026-10-01-harbour-design.md` §6 (Second Brain), §7 (Agents), §9 (UI), §14 phase 2

Phase 2 ships in two parts with separate implementation plans:

- **2a — Viewer and polish:** read and search the Second Brain, install Harbour as an
  app, Devices page improvements. No AI.
- **2b — Agents:** worker process, headless agent runner with live activity, research
  sprint, product discovery, and approval screens.

## Decisions

| Topic | Decision |
|---|---|
| Sequencing | 2a, then 2b |
| Brain location | `HARBOUR_BRAIN_DIR`, a separate git repo (private), never inside the code repo |
| Agent writes | Commit and push automatically after each successful run; "new" badge in the viewer |
| Run visibility | Status, elapsed time, live activity feed, cancel; full log on demand |
| Concurrency | One agent run at a time |
| Offline support | None (installable app shell only; Harbour holds live private data) |

---

## Part 2a — Viewer and polish

### A1. Brain access layer (`lib/brain/`)

- `resolveBrainPath(relative)`: joins with `HARBOUR_BRAIN_DIR`, rejects absolute paths,
  `..` segments, hidden segments (`.git`, dotfiles) and any path whose `realpath` is
  outside the brain root (symlink escape). Only `.md` files are served. Violations throw a
  typed error and render as 404 — never a stack trace.
- `listTree()`: directory tree of `.md` files and folders (hidden entries skipped), sorted
  folders-first then alphabetically; capped at 5,000 entries with a visible "tree
  truncated" note.
- `readDoc(path)`: returns `{ path, frontmatter, body, mtime }`. Frontmatter is parsed
  with a zod schema: `title?`, `tags?: string[]`, `researched?: date`,
  `confidence?: low|medium|high`, `review_by?: date`, `sources?: url[]`. Invalid
  frontmatter does not hide the document: it renders with a visible "frontmatter
  invalid" notice listing the problem.
- Missing or unreadable `HARBOUR_BRAIN_DIR` renders a clear setup screen (what the
  variable is, how to create the directory), not an error page.

### A2. Rendering

- Markdown → HTML on the server (unified/remark/rehype or equivalent), then sanitised
  with an allowlist (no scripts, no inline event handlers, no `style` attributes, no
  iframes). Headings get stable ids for the outline.
- `[[wiki-link]]` and `[[wiki-link|label]]` resolve by filename (case-insensitive,
  without `.md`) anywhere in the brain. Ambiguous names resolve to the shortest path and
  show a tooltip listing alternatives; unresolved links render as visibly broken (struck
  through, muted), never silently removed.
- External links get `target="_blank" rel="noopener noreferrer"`; images from external
  hosts are not loaded (CSP `img-src 'self' data:`), shown as links instead.
- Frontmatter renders as pills: tags, researched date, confidence, and a **stale** badge
  when `review_by` is in the past.

### A3. Layout (`/brain`, `/brain/[...path]`)

- Three columns, matching the approved mockup: file tree; reading column (Newsreader,
  ~65ch); context rail with outline, backlinks ("Linked from"), and sources.
- Below 1024px the tree collapses into a "Browse documents" disclosure above the
  reading column, and the context rail stacks below the document (side by side from
  1280px). The reading column is full width on small screens.
- `/brain` shows `00-start-here.md` if present, otherwise a short index of recently
  changed documents.
- Every page calls `requireSession()` (Lock 2 per page, as in Phase 1).

### A4. Search (⌘K)

- SQLite FTS5 table `brain_fts(path, title, body)` with a `brain_docs(path, mtime,
  content_hash, last_viewed_at)` table.
- Full reindex on web-process start; a file watcher (debounced 1s) reindexes changed
  paths, so new documents are searchable within ~2s. Watcher errors are logged and shown
  in the viewer header as "Search index may be stale — Reindex" with a manual reindex
  button (bounded: one reindex at a time).
- ⌘K / Ctrl+K opens an accessible command dialog: results show title, path and a
  highlighted snippet; full keyboard navigation; Esc closes and returns focus.

### A5. "New" badge

- A document is "new" when its `mtime` is later than `brain_docs.last_viewed_at`
  (or never viewed). Opening a document updates `last_viewed_at`. The tree shows a dot
  and the sidebar "Second Brain" item shows a count.

### A6. Open in editor

- Button builds a URL from `HARBOUR_EDITOR_URL_TEMPLATE` (default
  `vscode://file/{path}`), with the absolute file path URL-encoded. Hidden when the
  template is set to an empty string.

### A7. Installable app

- `/manifest.webmanifest`, `/icon`, `/apple-icon` and `/icons/*` are reachable with a
  Tailscale identity but no session (browsers fetch manifests without cookies); they
  contain no private data.
- `app/manifest.ts`: name "Harbour", short name "Harbour", `display: standalone`,
  theme/background colours from the light tokens, icons at 192/512 and maskable 512,
  `start_url: "/"`. Apple touch icon and theme-color meta in the root layout.
- No service worker caching of pages or data.

### A8. Devices improvements

- Device rows show added date **and time**, last used date and time, and a
  "This device" marker for the passkey that created the current session
  (`sessions.passkey_id`).
- Registering with a device name already in use is not blocked: the name gets a
  numeric suffix ("Laptop 2") and the setup page says "Saved as “Laptop 2” because that
  name was already used" before continuing.
- Removing the current device's passkey: the confirm text says "This will sign you out
  on this device".
- Dates use `HARBOUR_TIMEZONE` and `HARBOUR_LOCALE`.

### A9. Navigation

- Sidebar "Second Brain" becomes a live link with the new-document count.

---

## Part 2b — Agents

### B1. Worker process

- `worker/index.ts`, run by a second systemd user service `harbour-worker`
  (`Restart=always`), installed by `deploy/install.sh`. Shares `lib/` and the SQLite
  database with the web process.
- Tables: `jobs(id, kind, params json, status, attempt, created_at, started_at,
  finished_at, heartbeat_at, error, cancel_requested)`,
  `agent_runs(id, job_id, prompt_version, exit_code, files_changed json,
  commit_sha, pushed, stdout_tail, stderr_tail)`,
  `agent_run_events(id, run_id, at, kind, text)`.
- Status flow: `queued → running → ok | failed | cancelled`. The worker claims one job
  at a time with an atomic update; heartbeat every 10s. On start, any `running` job
  whose heartbeat is older than 60s is marked `failed` ("worker stopped during run").
- The web process only inserts jobs and sets `cancel_requested`; it never spawns agents.

### B2. Agent runner

- Spawns `claude -p` with:
  - working directory `HARBOUR_BRAIN_DIR`;
  - `--output-format stream-json --verbose` for live events;
  - `--allowed-tools` limited to web search, web fetch, Read, Glob, Grep, Write, Edit;
    `--disallowed-tools` Bash and any shell or notebook tool;
  - `--strict-mcp-config` with no MCP servers and no user/project setting sources, so
    personal integrations, plugins and hooks are not available to agents;
  - `--max-turns` and a wall-clock timeout per job kind; `--no-session-persistence`.
  Exact flag spellings are verified against the installed CLI during planning.
- Runs in its own process group; cancel and timeout send SIGTERM to the group, then
  SIGKILL after 10s. Captured output is capped (stdout/stderr tails, max 200 events per
  run stored).
- Stream events are summarised into `agent_run_events`: tool use ("Searching: …",
  "Reading: …", "Wrote: research/geo/…"), assistant milestones, errors.
- **Post-run gate:** the worker diffs the brain working tree. Every changed path must be
  inside the job kind's allowed area (research → `research/`; discovery →
  `products/<id>/`). Any change outside fails the run, and the worker restores those
  paths from git rather than committing them.
- **Commit and push:** allowed changes are committed (`agent(<kind>): <summary>`) with
  the configured git identity and pushed. Push failure leaves the commit local, marks
  `pushed = false`, and shows "Brain not synced — Retry" in the header; retry is a job.

### B3. Agents page (`/agents`)

- Lists recent runs with status, kind, product, elapsed time; "Run" buttons for each
  job kind (research topic or all topics, discovery per product).
- Run detail: live feed polled every 2s while running, Cancel button, files changed,
  commit link, full stdout/stderr tails.

### B4. Research sprint

- One job per topic, writing `research/<area>/<slug>.md` with the frontmatter
  convention above:
  1. SEO fundamentals
  2. Technical SEO checklist
  3. Local SEO
  4. How AI engines select and cite sources (GEO)
  5. llms.txt and AI crawler access
  6. AEO, featured snippets and AI Overviews
  7. Google Preferred Sources (how it works, eligibility, button/deeplink placement,
     whether each configured product could realistically qualify)
  8. Glossary
  9. Start-here guide for beginners (links the others)
  10. Scoring rationale for Phase 3 (proposed sub-score weights)
- Every factual claim cites a source; each document ends with "What this means for our
  products", informed by `harbour.config.json` and `products/<id>/notes.md`.

### B5. Product discovery

- One job per configured product. Inputs: product config entry and
  `products/<id>/notes.md` (owner-written: audience, positioning, differentiators;
  the job fails with a clear message if the notes file is missing).
- Outputs: `products/<id>/discovery.md` (evidence and reasoning) and
  `products/<id>/proposals.json`:
  `{ keywords: [{ term, intent, location?, why }], questions: [{ text, why }],
  competitors: [{ name, url, why }] }` — ~30 keywords, ~12 questions, 3–5 competitors.
- The worker validates `proposals.json` with zod; invalid output fails the run and
  imports nothing. Valid proposals are inserted as `proposed` into `keywords`,
  `questions`, `competitors` (product_id, fields, why, status, source_run_id). Re-running
  discovery adds new proposals and never overwrites approved or rejected items.

### B6. Approvals (`/settings/products/[id]`)

- Three lists (keywords, AI questions, competitors). Each proposed item shows its "why",
  with Approve, Edit (inline) and Reject; "Approve all proposed" per list.
- Status: `proposed | approved | rejected`; edits keep an `edited` flag. All mutations
  are same-origin JSON routes behind both locks, audited.
- Approved items are the inputs for Phase 3 scanning.

---

## Phase 3 additions recorded here

- `readiness` collector: detect the Google Preferred Sources button or deeplink on each
  product's pages, and whether the site has a regularly updated content section on its
  own domain or subdomain (eligibility is tied to fresh, Top-Stories-style content).
  Missing pieces become action cards.

## Testing

- **Brain:** path guard (traversal, symlink escape, hidden files, non-.md), tree cap,
  frontmatter valid/invalid, wiki-link resolution (resolved, ambiguous, broken),
  sanitisation (script, event handler, style, iframe removed).
- **Search:** index build, watcher update, snippet highlighting; dialog keyboard flow.
- **Worker:** fake clock for heartbeat and stale-job recovery; atomic claim; cancel.
- **Runner:** fake `claude` binary replaying recorded stream-json fixtures — success,
  timeout, cancel, write outside allowed area (restored, run failed), invalid
  proposals (nothing imported), push failure (commit kept, banner shown).
- **E2E:** brain viewer (tree, document, search, new badge), approvals flow, agents page
  with a fake runner, installable manifest served.

## Non-goals (Phase 2)

- In-app document editing.
- Live chat with agents.
- Offline mode.
- Scheduled runs (research refresh is manual in Phase 2; scheduling arrives with the
  Phase 3 scheduler).
