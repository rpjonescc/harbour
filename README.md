# Harbour

A calm, private, self-hosted control centre for your own projects. Harbour runs on an
always-on machine at home, is reachable only over your Tailscale network, and opens only
with a passkey.

The secure shell, design system, Second Brain viewer, agents, the daily visibility check, the
Actions board and the weekly AI analyst are built. The check measures how findable each product is
in classic search (SEO), in AI assistants (GEO) and as direct answers (AEO), scored 0–100 with
explainable breakdowns. The roadmap continues with:

- **Paid sources** — AI engine mentions and citations, keyword rankings and featured snippets
  (they need paid API keys, so they read "Not available yet" for now).
- **Plain-language UX** (built for every screen) — every screen says what something is, why it
  matters and what to do, in plain words; technical detail stays one click away
  ([spec](docs/superpowers/specs/2026-10-02-plain-language-ux-design.md)).
- **Content machine** (built, off by default) — ideas and drafts from your recent work, checked
  before you copy them; see [Content machine](#content-machine). Sending approved pieces to a
  scheduling tool, images and a feedback loop are planned, not built.

## Features

- **Today** — date, when your sites were last checked, a one-sentence briefing (overall health and
  the biggest opportunity, then how many things are worth doing, how many Claude is handling and
  anything broken: a check that didn't finish, a failing data source or a backup that needs a look),
  a plain verdict per product and area (Found on Google, Recommended by AI assistants, Answer-ready:
  Strong 85+, Good 70–84, Fair 50–69 or Needs work under 50, with the score and its change beside
  it; "What's this?" explains each area, and the numbers with a 30-day SEO trend sit under Technical
  details), **Next up** (the top three actions as plain cards: why each matters, its area, how big a
  job it is and who's on it), and **Behind the scenes**: paid spend, backup warnings and any data
  source that failed in the last check, each saying what happened, whether it matters and what to do
  (raw errors under Technical details). Until the first check finishes it shows clearly labelled
  sample data.
- **Product pages** — per product: three area cards (Found on Google, Recommended by AI
  assistants, Answer-ready) each with a verdict, the small number and "What's this?", a
  one-line summary, **Check now**, a tab per area listing its sub-scores as plain sentences
  (weakest first), **What to fix** with a **Hand to Claude** button that copies a ready prompt,
  the pages Harbour checked, and Google Search Console totals. The numbers, scoring keys, raw
  evidence, page and search tables sit under **Technical details**.
- **Actions board** — every issue the check finds becomes a tracked action, grouped as Big wins,
  Worth doing and Small wins. Each card is a headline, one line on why it matters, a chip for how
  big a win it is (Big win, Worth doing, Small win) and a chip for who's on it (a new idea not
  decided yet, Claude is on it, a pull request waiting for your OK, waiting for you to look it over
  when it is In review without a pull request, or waiting for you), with the
  area, how big a job it is (a quick job, an afternoon or a project) and the product in one small
  line, and a link to its pull request. The full reason, evidence, where it came from, the exact fix
  and check, and **Hand to Claude** (a ready prompt) sit under **Technical details**. Filter by
  product, area and status (a plain, bookmarkable form); move an action through New ideas → Backlog →
  In progress → Done, snooze it until a date or dismiss it. The sidebar badge reads "N things worth
  doing". Claude can triage the board for you with `pnpm actions`, every change recorded with its
  reason.
- **Sources** — where each score's data comes from and whether it is working: whether the daily
  check is on and when the next one is, which data sources are connected (never their secrets;
  the ones still to connect say how, under **Technical details**), and each source's last
  run and outcome per product.
- **Products from config** — list your products in `harbour.config.json`; each gets a
  colour from a six-hue palette. Without it, a clearly labelled demo config is shown.
- **Devices** — add a passkey to a new device with a one-time link, see when each device was
  added and last used and which one you are using, or remove a lost one. Reused device names
  get a number.
- **Second Brain** — read Markdown notes with a document tree, frontmatter, links and backlinks.
- **Agents** — Claude's background work, saved to your Second Brain, one job at a time: research
  on a topic, **Find ideas** for each site, the weekly report and the monthly research refresh.
  Each run has a plain page (Waiting for its turn, Running now, Done, Didn't finish or
  Stopped) with **Stop this run**, and its step-by-step log sits under **Technical details**.
  Saving and syncing are automatic (see [Research refresh](#research-refresh)).
- **Content machine** — turns what you have been working on into ideas, then six checked drafts
  per idea (LinkedIn, X, Instagram, Facebook, a blog post and a website section) that you read,
  copy, approve or discard on the Content page. Off by default; it never posts anything (see
  [Content machine](#content-machine)).
- **A warm friend** — Today opens with a short note an agent writes fresh every morning, in
  the voice of a seasoned, warm, quick-witted friend: it celebrates real wins, is honest and
  kind about bad news and always gives a next step, and on a weekend or late at night says what
  can wait. Both the note and the [ocean background](#ocean-background) are off with
  `HARBOUR_PERSONALITY=quiet` (see [Daily note](#daily-note)).
- **Ocean background** — the lower half of every page, the sign-in page included, is calm water:
  three soft wave layers rolling slowly behind the content (see
  [Ocean background](#ocean-background)).
- **Works on a phone** — on narrow screens the sidebar folds into a top bar with a **Menu**
  button (Escape closes it), and the page uses the full width without sideways scrolling.
- **Cost meter** — Today shows this month's paid API spend against your monthly budget, with a
  month-end projection, a warning at 80 % and a pause at 100 %. Until a paid source (Treg, for
  the weekly [outside view](#the-outside-view-treg)) is connected it says "No paid data
  connected" (see [Costs and budget](#costs-and-budget)).
- **Design system** — "Paper & Tide" tokens (primitives → semantic) in light and dark, with
  a living reference at `/design` showing every component in its main states.
- **Nightly backups** — a verified copy of the database every night at 03:15, the newest 14 kept,
  with retries and a catch-up after downtime (see [Backups and restore](#backups-and-restore)).
  Today warns when the last backup failed with no retry left, when there has been none for 2 days,
  or when Harbour can't open the backup folder.
- **Settings** — one read-only page showing what Harbour is set up to do, in sections that
  each open with one plain line on what they are for: **Products**, **Schedules** and their next
  runs, **Connections** (each reads Connected, Not connected yet or Not available yet, never a
  value), **Budget** and this month's spend, **Backups** with **Back up now**, and **More
  settings** linking to Sources, Devices and each product's research targets. Setting names and
  the steps to change one (edit `.env` and `harbour.config.json`, then restart) sit under
  **Technical details**.
- **Accessible by default** — keyboard paths, visible focus, accessible names, rem-based type.

### Pages

| Path | What it shows |
|---|---|
| `/` | Today |
| `/products/<id>` | A product's scores, issues, pages and sources |
| `/content` | Content (only when `HARBOUR_CONTENT=on`, else 404): ideas and drafts in six tabs, with Copy, Approve, Edit and Discard; nothing is posted for you |
| `/actions` | Actions board: a six-column board by default, or the list with `?view=list` (`?product=<id>&area=SEO\|GEO\|AEO` on both; the list also takes `&status=active\|suggested\|snoozed\|done\|dismissed\|all`, whose stored values the list shows as New ideas (`suggested`), Backlog (`open`), In progress, Done, Snoozed and Dismissed; the board takes `&focus=stuck\|needs-you`). `#column-<id>` jumps to a column |
| `/settings` | Settings overview: products, schedules, connections, budget and backups |
| `/settings/products/<id>` | A product's research targets (keywords, AI questions, competitors, content pillars) |
| `/settings/sources` | Check schedule, connections and each source's last run |
| `/brain` | Second Brain |
| `/agents` | Agent runs |
| `/settings/devices` | Passkeys and devices |
| `/design` | Design system reference |

Five JSON endpoints change things; like every mutating route they take same-origin JSON from a
signed-in session:

- `POST /api/scans` with `{"productId": "<id>"}` queues a check for the worker (as **Check now**
  does).
- `POST /api/backups` with an empty body `{}` queues a backup of today for the worker (as
  **Back up now** on Settings does), even when the nightly backup is off. It answers
  `{"jobId": 12, "created": true}` (`created: false` when one is already queued or running) and
  is written to the audit log.
- `POST /api/agents/run` queues agent runs (as the buttons on **Agents** do), for example
  `{"kind": "refresh"}` to refresh up to 3 stale research documents. It answers
  `{"jobIds": [...], "stale": 4}` (an empty list when nothing is stale) and refuses with
  `409 token_missing` while `HARBOUR_CLAUDE_OAUTH_TOKEN` is not set.
- `POST /api/agents/run` with `{"kind": "daily-note"}` queues a fresh daily note (as **Write me
  a fresh one** on Today does), stamped with the server's local time: one at a time and at most
  5 requests a day. It answers `{"jobIds": [12]}`, or refuses with `409 token_missing`,
  `409 personality_quiet` or `429 rate_limited`.
- `POST /api/content` with `{"action": "make-digest"}` queues the activity digest for yesterday (as
  **Make today's digest now** will), when `HARBOUR_CONTENT=on` and both `HARBOUR_CLAUDE_OAUTH_TOKEN`
  and `HARBOUR_SCREENPIPE_API_KEY` are set. It answers `{"jobIds": [12]}` (the same job on a second
  click) and refuses with `409 content_off`, `409 token_missing`, `409 screenpipe_missing` or
  `429 daily_cap` / `429 rate_limited`.
- `POST /api/content` with `{"action": "find-ideas", "productId": "acme-docs"}` queues one ideas run
  for a content-enabled product (as **Find new ideas** will). It needs `HARBOUR_CONTENT=on`, the
  Claude token and a voice profile for that product, and refuses with `404 not_found`,
  `409 voice_missing`, `409 backlog` ("12 ideas are waiting; skipped"), `409 brain_unreadable`,
  `429 daily_cap` or `429 rate_limited`. The same Monday 07:00 run is queued by the worker for
  every product with a voice profile (`HARBOUR_SCHEDULED_IDEAS`); it uses whatever digest exists at that moment, so a `HARBOUR_DIGEST_TIME` later than 07:00 means the Monday run may go before that day's digest; it reads only the last 7 days of
  activity themes, your approved pillars, the product's notes and the titles you already have.
- `POST /api/content` with `{"action": "write-this", "ideaId": "<id>"}` queues the draft for an idea
  that is still an idea (as **Write this** does; a second click returns the same job), and
  `{"action": "try-again", "ideaId": "<id>"}` re-queues the idea's newest step that failed or was
  cancelled (as **Try again** does). Try again is limited to four requests per idea per local day
  with every other manual request for it, and refuses with `404 not_found`, `409 nothing_to_retry`
  or `429 rate_limited`. Both only queue work: the web process never writes the brain.
- `POST /api/content` decisions (as **Approve**, **Edit** and **Discard** do) only queue a
  `content-decision` job; the worker saves it, commits just those files and pushes. They need
  `HARBOUR_CONTENT=on` but no Claude token, because no model runs.
  `{"action": "approve", "pieceId": "<ideaId>.<platform>", "revision": 2, "checkedFlags": [], "confirmOpen": false}`
  must list every flag the piece carries and, for a piece that still needs you, set `confirmOpen`.
  `{"action": "edit", ..., "body": "..."}` replaces the piece's main text (up to the platform's own limit) and re-checks only the numbers and the platform's limits, never the writing.
  `{"action": "discard", "pieceId": "...", "revision": 2}` or `{"action": "discard", "ideaId": "..."}`
  keeps the file, marked discarded. `revision` is the one the page showed: an older one is refused
  (`409 stale`). Other refusals: `400 flags_unchecked`, `400 confirm_needed`, `400 too_long`,
  `404 not_found`, `409 not_approvable`, `409 not_editable`, `409 no_change` (an edit with the same words), `409 already_discarded`,
  `409 brain_unreadable`, `413 too_large` and `429 busy`. Approving writes
  `content/approved/<platform>/<date>-<slug>.md` in the brain (never over an existing file; a clash
  gets `-2` to `-9`); discarding an approved piece removes that file. Nothing is ever posted.
- `POST /api/content` with `{"action": "send-to-postiz", "pieceId": "<ideaId>.<platform>", "revision": 3, "resend": false}`
  queues a `content-postiz` job for an approved LinkedIn, Facebook or Instagram piece (as **Send
  to Postiz as a draft** does); the worker makes the draft in Postiz. It needs `HARBOUR_CONTENT=on`,
  `HARBOUR_POSTIZ_URL` and `HARBOUR_POSTIZ_API_KEY`, and a channel for that platform. A piece already
  sent is refused with `409 confirm_resend` (its message asks "Send it again?") unless `resend` is
  `true`. Other refusals: `404 not_found`, `409 content_off`, `409 postiz_off`, `409 not_supported`,
  `409 not_approved`, `409 stale`, `409 no_channel`, `409 brain_unreadable`, `429 postiz_busy` (one
  send at a time) and `429 rate_limited` (five sends an hour).
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
  rationale), or **Run all research** to queue them all (a topic that already has a
  research run or refresh queued or running keeps that run). Each writes one document under
  `research/` (or `00-start-here.md`).
- **Find ideas** — one run per product (**Find ideas for Acme Docs**); it reads your
  `products/<id>/notes.md` and writes `products/<id>/discovery.md` and
  `products/<id>/proposals.json`.

Agents run Claude Code on the Harbour PC with your Claude subscription. Run `claude setup-token`
there, add `HARBOUR_CLAUDE_OAUTH_TOKEN=…` to `.env`, then restart both services
(`systemctl --user restart harbour-web harbour-worker`) — also after changing the token. The worker
reads the token to run agents; the web only checks whether it is set, and keeps the run buttons
disabled until it is. Agents only have web research (search and fetch) and file tools limited to the
brain directory: no shell, no hooks, no MCP servers. The daily note agent is narrower still: it has
only the `Write` tool, no web at all.

The **git gate** checks every run: a run may change only its own target files (Markdown, plus
`proposals.json` for discovery and the weekly analyst). Any other change fails the run, and
everything the agent changed is moved to quarantine and restored from git. An attempt to write
outside the brain fails the run too, even though Claude Code denies the write; the error names the
path it tried. The gate knows which files the agent wrote (every write it makes is listed in its
output), so you can keep editing the brain while a run is going: your edits are never committed with
the agent's work or discarded with it — they stay in place and are saved automatically as usual. A
file both of you edited counts as the agent's. Only one agent runs at a time; queued runs wait their
turn. Each run has a live page with a **Stop this run** button (the step-by-step log is under
**Technical details**), and lists the files it changed. Without a Claude token the server refuses
new agent runs.

Discovery results are proposals, not commitments. Open a product in the sidebar and choose
**Research targets** (`/settings/products/<id>`) to see its proposed keywords, AI questions and
competitors, each with the agent's reason. **Approve**, **Reject** or **Edit** each one, or
**Approve all** per list (items waiting for your OK). Choosing **Find ideas** again never overwrites items you've already
decided on.

For a product with content turned on, discovery also proposes three to five **content
pillars** (recurring themes to write about), approved the same way. Harbour keeps at most six
approved pillars; to approve another, reject one first.

Saving and syncing need no action. The Agents page and the Second Brain say "Saved · synced",
or show note files that "will be saved automatically soon" and saved changes "waiting to reach
GitHub — Harbour keeps retrying"; **Save now** and **Retry now** are optional shortcuts. While an
interrupted run is being recovered, a banner says so and saving is paused.

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
  "Suggested by the weekly report"; accept or dismiss each one. An action the product already
  has (a new idea, in Backlog, in progress, snoozed or dismissed) is not suggested again.
- **When it runs** — every Sunday at 20:00 in `HARBOUR_TIMEZONE`, for that week (see [When things
  run](#when-things-run)). The **Weekly report** panel on **Agents** shows the next scheduled run
  (or that a run is queued or running, that a catch-up is due, or that scheduled runs are off or
  need a Claude token) and links the latest report; **Write this week's report now** (or
  `pnpm analyst:now`) queues a run for the current week straight away. A run whose suggestions could
  not be imported after 3 attempts says "Claude's ideas from this run weren't saved. Run it
  again." under it in **Recent runs**.

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
  [When things run](#when-things-run)), and whenever you choose **Update old research** on
  **Agents**. The **Research refresh** panel there shows the next scheduled refresh, which
  documents are due (with their dates) and how many are not written yet.

### Install as an app

Harbour can be installed like an app, with its own window and icon. In Chrome or Edge, open
Harbour and choose **Install Harbour** from the address bar or menu; on Android choose
**Add to Home screen**; on iPhone and iPad use **Share → Add to Home Screen**. Harbour needs
a live connection to your PC, so it has no offline mode.

## Content machine

Harbour can suggest, draft and check posts for your products, from what you have actually been
working on. It is **off by default** and **never publishes anything**: you read, edit, copy,
approve or discard each piece on the **Content** page, and you post it yourself.

**How it works.** Each morning Harbour asks your local [Screenpipe](https://screenpi.pe) (a
recorder of your own screen) for yesterday's windows and a small sample of its on-screen text,
**keeps only short excerpts that mention a product you listed**, strips anything private, and has
an agent turn what is left into a few general themes ("Rewrote the getting-started guide"). Only those themes are stored
(the **digest**). On Mondays it suggests ideas for each product from the themes, your notes, your
voice profile and the product's content pillars. When you press **Write this** on an idea, Harbour
writes one source piece, turns it into six platform pieces (LinkedIn, X, Instagram, Facebook, a
blog post and a website section), and runs each through four checks in order: `no-ai-slop`,
`humanizer`, a facts and claims check, and a platform check. A piece that passes everything is
**Ready for you**; one that is still wrong after one revision is **Needs you**, with one sentence
saying what to do. Approving a piece copies it, as clean markdown, to `content/approved/` in your
Second Brain; the Copy buttons give you the text without any of Harbour's notes.

**Privacy.** Screenpipe sees everything on your screen, so Harbour asks for as little as it can:

- A few requests per product, to Screenpipe on this machine only (the address must be `127.0.0.1`,
  `[::1]` or `localhost`, so its key never leaves it): one for the list of windows you used, and
  one text search for each of the product's terms (at most 10), all within 60 seconds.
- Screenpipe's text search returns whole screens with no app or window name, so Harbour never uses
  a hit as it is. A screen that shows a private-context cue (wording such as inbox, password,
  sign in, bank, invoice, calendar, patient portal or private browsing) is dropped whole, which
  also drops some harmless screens on purpose, as is a screen that shows an email address, a phone
  or card-like number or a link with a password. Cues are also matched through common scanner
  mistakes ("passw0rd", "Iog in"). From the rest it keeps only about 120 characters either side of
  your term, at most 30 excerpts per product and 24 KiB, picked evenly across the day. Each
  product's reading is bounded: 10 searches, 60 seconds of requests, about a second of filtering.
- Filtered in memory before any model sees it: password managers, email, chat, calls, banking and
  private windows are dropped whole when the app or window name is known (a window row needs both
  an app and a title); links, email addresses, phone numbers, tokens, card-like numbers, handles
  and anything on your never-mention list (`content/never-mention.md`, one term per line) are
  removed. Dropping on wording is weaker than dropping on an app name, because a private screen
  may not show any cue, so excerpts are short and redacted and you should read the first digests.
- Accepted residuals, which is why the first digests must be read: a chat line with a person's name
  and no cue word, a medical value, a street address, a password shown on its own, and a
  20-character hex string can all get through an excerpt.
- The agent that reads it has one tool, to write one file. Raw screen text is never written to the
  brain, the database, the logs or the backups, and the run record of the digest keeps no model
  text and no file names.
- Digests are committed to your private brain repository, so they stay in its history. Read the
  first few before leaving the daily digest switched on.

**Set it up.**

1. Install the skills Harbour pastes into its runs. `no-ai-slop` and `humanizer` come from their
   own repositories: put them in `~/.claude/skills`. The third, `atomizer`, ships here
   (`skills/atomizer/`): run `pnpm skills:install` to copy it into `HARBOUR_SKILLS_DIR` (default
   `~/.claude/skills`), and run it again after pulling a newer Harbour. Harbour reads the skills
   folder when it needs a skill, refuses a missing, oversize, linked or hidden-character file with a
   plain reason, and records a hash of what it used.
2. In `harbour.config.json` add a `content` block that lists, for each product, the words that
   appear on your screen when you work on it (`terms`, 1 to 10) and optionally which `platforms`
   to write for (all six by default). Add `excludeApps` for any app Harbour must never read. See
   `harbour.config.example.json`. For something you write about that has no website, add it under
   `content.projects` instead (see [Projects without a website](#projects-without-a-website)).
3. For each product, write a **voice profile** at `content/voices/<product id>.md` in your Second
   Brain. The format and a fictional example are in `skills/atomizer/voice-profile.md`; the
   Content page shows the template too. Harbour refuses to write for a product without one.
4. Set the settings below in `.env` (the full table is under [Configuration](#configuration)),
   then restart the web service and the worker. Screenpipe must run on the same machine as
   Harbour, and `HARBOUR_CLAUDE_OAUTH_TOKEN` must be set.
5. Optional: have **Discovery** (Agents page) propose content pillars for a product, then approve
   them on the product's research targets page. At most six pillars are kept per product.

#### Projects without a website

A project that is not a site you monitor (a side project, a book, a talk) can still get content.
List it under `content.projects` in `harbour.config.json`, with a `name`, 1 to 10 `terms` and
optionally `platforms` (every platform but the website section by default, since there is no site to put one on; list `"website"` yourself if you want it):

```json
{
  "content": {
    "projects": {
      "acme-tools": { "name": "Acme Tools", "terms": ["acme tools"], "platforms": ["linkedin", "blog"] }
    }
  }
}
```

The `id` (here `acme-tools`) is a lowercase slug of up to 40 characters, and it must not be the id
of one of your products. A project is not a product: Harbour does not check or score it, and it
does not appear on Today, Actions or the product pages, so it needs no `url`, `hue` or Search
Console property. Everywhere else it works like a site: the digest looks for its terms, ideas are
suggested for it, and it needs a voice profile at `content/voices/<id>.md` and notes at
`products/<id>/notes.md` in your Second Brain. Both files are written by hand: a project has no
Discovery run, no content pillars and no settings page, and the Content page tells you in plain
words when either file is missing. Because it has no website, a piece for it may carry
no links at all: any link is refused.

| Setting | Default | What it does |
|---|---|---|
| `HARBOUR_CONTENT` | `off` | `on` turns the machine on: the Content page, the digest, ideas and drafting. |
| `HARBOUR_SCREENPIPE_URL` | `http://127.0.0.1:3030` | Screenpipe's local API; loopback only. |
| `HARBOUR_SCREENPIPE_API_KEY` | unset | Secret, from `screenpipe auth token`. Unset means no digest (a gap, not an error). |
| `HARBOUR_SCHEDULED_DIGEST` | `on` | `off` stops the daily digest; **Make today's digest now** still works. |
| `HARBOUR_DIGEST_TIME` | `05:45` | Local time the digest of yesterday is made. |
| `HARBOUR_SCHEDULED_IDEAS` | `on` | `off` stops Monday 07:00 idea runs; **Find new ideas** still works. |
| `HARBOUR_CONTENT_DAILY_RUNS` | `24` | Content agent runs per local day (1 to 100), scheduled and manual together. |
| `HARBOUR_SKILLS_DIR` | `~/.claude/skills` | Where the three skills are installed; must be outside the brain. |
| `HARBOUR_POSTIZ_URL` | unset | Optional: your Postiz's backend address, on this machine or your tailnet. See below. |
| `HARBOUR_POSTIZ_API_KEY` | unset | Optional secret: a Postiz API key. Set both or neither. |

**The Content page** (`/content`) has six tabs: Ready for you, Needs you, Ideas, Being written,
Approved and Discarded. Each idea is a headline and one line; a piece opens to plain text with Copy
buttons, and its checks, claims and skill hashes sit under **Technical details**. **Approve** asks
you to tick every claim Harbour flagged (health, legal, curriculum, pricing, testimonial or
comparison), and for a piece that still needs you it says what is open and asks "Approve anyway?".
**Edit** re-checks the numbers and the platform's limits, never the writing. **Discard** keeps the
file, marked discarded; an approved piece's export is removed with it. There is no way to reopen a
discarded idea: find new ones instead. A step that did not finish shows **Try again**.

**Limits.** At most `HARBOUR_CONTENT_DAILY_RUNS` content agent runs a day; one idea takes at most
8. You can ask for the digest twice a day, new ideas three times a day per product, and any step of
one idea four times a day; 12 ideas wait per product. A step of a chain already under way finishes
even past the daily limit. A digest the worker was too late for is made the same day only, and a
missed Monday run is made the same week only: nothing is caught up later.

**Where things live.** Everything is a markdown file in your brain under `content/` (digests,
ideas, pieces with a `.gates.json` record of each check, `approved/` exports), so you can read it in
the Second Brain viewer or your editor. The Content page only reads; a worker job saves every
approve, edit and discard and commits just those files. The web process never runs an agent.

#### Send to Postiz as a draft

[Postiz](https://postiz.com) is a free, open-source social media scheduler you can run yourself.
If you do, Harbour can put an approved LinkedIn, Facebook or Instagram piece into it **as a
draft**, so you can add images, preview it and post it from Postiz. Harbour never schedules,
publishes or deletes anything there: the client it uses can only list your channels and create a
draft. It is off until you set it up.

1. In Postiz, connect your social accounts (Postiz calls them channels). Harbour never sees their
   passwords or tokens.
2. In Postiz, open **Settings** and create an API key.
3. In Harbour's `.env`, set `HARBOUR_POSTIZ_URL` to Postiz's backend address (Postiz's own
   backend URL, which ends in `/api`; for the standard Docker setup on this machine that is
   `http://127.0.0.1:4007/api`) and `HARBOUR_POSTIZ_API_KEY` to the key. The address must be on this
   machine or your tailnet, and Harbour never follows a redirect, so the key goes nowhere else.
4. In `harbour.config.json`, map each platform to a channel id under `content.postiz.channels`
   (`linkedin`, `facebook`, `instagram`; X, blog posts and website sections are never sent). The
   ids are in Postiz (or its `GET /public/v1/integrations` answer). See `harbour.config.example.json`.
5. Restart both services: `systemctl --user restart harbour-web harbour-worker`. Settings then shows
   Postiz as **Connected**.

On an approved piece the Content page then shows **Send to Postiz as a draft**. Only the piece's
text is sent (LinkedIn and Facebook: the text and hashtags; Instagram: the caption and hashtags,
not the visual brief), with no images. The worker checks the channel exists, is switched on and is
the right kind for the platform, creates the draft, and notes `postiz: { sentAt, postId }` on the
piece in your brain. Sending a piece again asks first and makes a second draft. At most five sends
start in any hour, one at a time. If Postiz is down or refuses, the send fails with one sentence
saying what to do, and the piece stays approved. **The key can publish**, even though Harbour only
makes drafts with it, so keep it like the Claude token: only in `.env`, used only by the worker.

**What is not built.** Posting or scheduling from Harbour (it never posts), images (Instagram gets
a written visual brief), analytics and the feedback loop, pruning old
digests (git history keeps them anyway), a skills panel on the Agents page, and Search Console
queries as an input to ideas. The design and its known limits are in the
[content machine spec](docs/superpowers/specs/2026-10-02-content-machine-design.md).

## Security model

Harbour is built to be safe to leave running:

- **Loopback only.** The web server binds `127.0.0.1:3400`; nothing on your LAN can reach it.
- **One host name.** A request whose `Host` header is not `HARBOUR_ORIGIN`'s host (and port) is
  rejected with 403, so another site cannot reach Harbour by pointing its own name at it
  (DNS rebinding). Open Harbour at exactly the address in `HARBOUR_ORIGIN`.
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
pnpm worker         # runs queued jobs (agents, checks, backups, retention), one at a time (reads .env)
pnpm agents:initial-run  # once: queues every research topic, then discovery per product
pnpm scan:now       # queues a visibility check of every product now (or: pnpm scan:now <productId>)
pnpm analyst:now    # queues the weekly analyst report for the current week now
pnpm backup:now     # queues a backup of the database now (see "Backups and restore")
pnpm retention:check  # read-only: what the next retention run would delete (see "Data kept")
pnpm skills:install # copies the atomizer skill into HARBOUR_SKILLS_DIR (see "Content machine")
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
| `HARBOUR_TIMEZONE` | no | server's zone | IANA timezone for dates, the nightly backup at 03:15, the daily check at 06:00 and the weekly analyst on Sundays at 20:00 local time (daylight saving included). |
| `HARBOUR_LOCALE` | no | `en-US` | BCP 47 locale for dates. |
| `HARBOUR_BRAIN_DIR` | no | `./brain` | Second Brain directory — point it at a separate private repo. The worker refuses all git work unless it is the root of its own git repository. |
| `HARBOUR_EDITOR_URL_TEMPLATE` | no | `vscode://file/{path}` | Editor link for brain documents; `{path}` is the encoded absolute file path. Empty hides the link. |
| `HARBOUR_DEV_IDENTITY` | dev only | — | Stand-in Tailscale login for `next dev`; refused in production. |
| `HARBOUR_CLAUDE_OAUTH_TOKEN` | for agents | unset | Secret; from `claude setup-token`; required for agents. Used by the worker; the web only checks whether it is set. Never shown. Restart both services after changing it. |
| `HARBOUR_CLAUDE_BIN` | no | `claude` | Claude Code CLI executable the worker runs: a command on the worker's `PATH`, or an absolute path (e.g. `/opt/claude/bin/claude`). |
| `HARBOUR_AGENT_MODEL` | no | `claude-sonnet-5-5` | Full model id used for agent runs. |
| `HARBOUR_AGENT_TIMEOUT_MINUTES` | no | `30` | Maximum agent run length, 1 to 120 minutes. |
| `HARBOUR_CRAWL_MAX_PAGES` | no | `200` | Most pages the visibility check's crawler fetches per product per check, 1 to 500. The crawler stays on the product's origin, honours `robots.txt`, and fetches at most two pages at a time, at least 500 ms apart. |
| `HARBOUR_SCHEDULED_SCANS` | no | `on` | `off` stops the worker queueing checks by itself (the daily 06:00 check and the catch-up on start); `pnpm scan:now` still queues them by hand. Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_ANALYST` | no | `on` | `off` stops the worker queueing the weekly analyst by itself (Sundays at 20:00 and the catch-up on start); **Write this week's report now** and `pnpm analyst:now` still queue it by hand. Restart the worker after changing it. |
| `HARBOUR_PERSONALITY` | no | `warm` | `warm` or `quiet`. `quiet` turns off the daily note (its job, its card on Today) and the ocean background on every page. See [Daily note](#daily-note). Restart both services after changing it. |
| `HARBOUR_NOTE_TIME` | no | `06:30` | The local time, `HH:MM` in `HARBOUR_TIMEZONE`, the worker writes the daily note each day (and catches up on start). Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_NOTE` | no | `on` | `off` stops the worker queueing the daily note by itself; **Write me a fresh one** on Today still queues it. Restart the worker after changing it. |
| `HARBOUR_CONTENT` | no | `off` | `on` turns on the content machine: the Content page, the daily activity digest, ideas and drafting. Off hides the page and stops every content job. Restart both services after changing it. |
| `HARBOUR_SCREENPIPE_URL` | no | `http://127.0.0.1:3030` | Screenpipe's local API. Must be an `http` origin on `127.0.0.1`, `[::1]` or `localhost`, so its key never leaves this machine. |
| `HARBOUR_SCREENPIPE_API_KEY` | no | unset | Secret. From `screenpipe auth token`. Unset means no activity digest; Settings shows "Not connected yet". |
| `HARBOUR_SCHEDULED_DIGEST` | no | `on` | `off` stops the worker queueing the daily digest; **Make today's digest now** on Content still works. |
| `HARBOUR_DIGEST_TIME` | no | `05:45` | Local time, `HH:MM` in `HARBOUR_TIMEZONE`, the digest of the day before is made. |
| `HARBOUR_SCHEDULED_IDEAS` | no | `on` | `off` stops Monday 07:00 idea runs; **Find new ideas** on Content still works. |
| `HARBOUR_CONTENT_DAILY_RUNS` | no | `24` | Content agent runs allowed per local day (1 to 100), scheduled and manual together. |
| `HARBOUR_SKILLS_DIR` | no | `~/.claude/skills` | Where the `no-ai-slop`, `humanizer` and `atomizer` skills are installed. Must be outside the brain. |
| `HARBOUR_POSTIZ_URL` | no | unset | Your self-hosted Postiz's backend address, ending in `/api` (for example `http://127.0.0.1:4007/api`). `http` or `https`, on this machine (`127.0.0.1`, `[::1]`, `localhost`) or your tailnet (a `*.ts.net` name or a `100.64.0.0/10` address), with no user, query or fragment. Set it with the key, or neither. See [Send to Postiz as a draft](#send-to-postiz-as-a-draft). Restart both services after changing it. |
| `HARBOUR_POSTIZ_API_KEY` | no | unset | Secret; a Postiz API key (Postiz Settings). Only the worker uses it, only to list channels and create drafts; Settings shows only Connected or Not connected yet. The key itself could publish, so keep it like the Claude token. |
| `HARBOUR_BACKUP_DIR` | no | `<folder of HARBOUR_DB_PATH>/backups` | Where the nightly backups go (see [Backups and restore](#backups-and-restore)). Use a dedicated folder: old backups are pruned from it by name, so `/`, your home folder and the temp folder are refused, as is anything inside `HARBOUR_BRAIN_DIR` (also through a symlink), because the brain is pushed to a remote. Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_RESEARCH` | no | `on` | `off` stops the worker queueing the monthly research refresh by itself (the first Sunday of each month at 21:00 and the catch-up on start); **Update old research** on **Agents** still queues it by hand. Restart the worker after changing it. |
| `HARBOUR_SCHEDULED_BACKUP` | no | `on` | `off` stops the worker queueing the nightly backup by itself (03:15 and the catch-up on start); `pnpm backup:now` still queues one by hand. Restart the worker after changing it. |
| `HARBOUR_OBSERVATION_SCANS_KEPT` | no | `30` | How many of each product's newest checks keep their raw observations (7 to 365); older checks' observations are deleted after each verified backup (see [Data kept](#data-kept)). Scores and check history are always kept. Restart the worker after changing it. |
| `HARBOUR_PAGESPEED_API_KEY` | for PageSpeed | unset | Secret; a Google Cloud API key restricted to the PageSpeed Insights API (see [Connect PageSpeed](#connect-pagespeed)). Once a week per product the check asks PageSpeed Insights for mobile performance and Core Web Vitals (this sends the product URL to Google). Without a key PageSpeed shows as not connected: Google gives keyless requests no quota. Used by the worker only; never logged, shown or stored with results. Restart the worker after changing it. |
| `HARBOUR_GSC_CREDENTIALS` | for Search Console | unset | Absolute path to a Google credentials JSON file — a service account key or an OAuth authorized-user file (see [Connect Search Console](#connect-search-console)). Keep it outside the repo with mode 600; Harbour warns in the check if other users can read it. Read by the worker only; its contents and the access tokens are never logged, shown or stored. Restart the worker after changing it. |
| `HARBOUR_MONTHLY_BUDGET_AUD` | no | `0` | Monthly cap on paid API spend in Australian dollars, 0 to 10000 in whole cents (e.g. `60` or `12.50`). `0` means no paid calls at all. See [Costs and budget](#costs-and-budget). Restart both services after changing it. |
| `HARBOUR_TREG_API_KEY` | no | unset | Secret key for Treg, the pay-per-call service behind the weekly outside view (links to you, where you rank, whether AI assistants name you). Only the worker reads it; Settings shows only Connected or Not connected yet. Needs a monthly budget and a `tracking` list. See [The outside view](#the-outside-view-treg) and [Costs and budget](#costs-and-budget). |
| `HARBOUR_USD_TO_AUD` | no | `1.55` | US dollars to Australian dollars, 1 to 3. Treg charges in US dollars; this converts both the amount reserved before a call and the charge recorded after it into the AUD ledger and budget. |
| `HARBOUR_DATAFORSEO_LOGIN` | no | unset | Not used yet — reserved for the DataForSEO login of the future rankings and SERP collectors. Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_DATAFORSEO_PASSWORD` | no | unset | Not used yet — reserved for the DataForSEO password of the future rankings and SERP collectors. Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_OPENAI_API_KEY` | no | unset | Not used yet — reserved for the future AI-engines collector (ChatGPT search). Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_PERPLEXITY_API_KEY` | no | unset | Not used yet — reserved for the future AI-engines collector (Perplexity Sonar). Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_GEMINI_API_KEY` | no | unset | Not used yet — reserved for the future AI-engines collector (Gemini with Google grounding). Secret: only whether it is set will ever be shown (on Settings), never its value. |
| `HARBOUR_TEST_MODE` | tests only | `0` | `1` marks the end-to-end test environment (`pnpm test:e2e` sets it). Refused unless `HARBOUR_ORIGIN` is a loopback origin (`http://localhost`, `127.0.0.1` or `[::1]`), so a deployed Harbour cannot turn it on. Never set it yourself. |
| `HARBOUR_SCAN_ALLOW_LOOPBACK` | tests only | `0` | `1` lets checks reach `127.0.0.1` / `::1`, so the end-to-end tests can check a local fixture site. Refused unless `HARBOUR_TEST_MODE=1`; private and tailnet addresses stay refused either way. Never set it yourself. |
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
      "kind": "product",
      "searchConsoleProperty": "sc-domain:docs.example.com"
    }
  ]
}
```

`kind` is optional: `"product"` (the default) or `"news"`. Google's Preferred Sources is a Top
Stories feature, so it only counts toward a news site's Answer-ready score; for every other site
the "Fresh pages" part of Answer-ready counts fresh content alone. Scores from formula v2
onwards use it; earlier scores are kept as they were.

`id` is a unique lowercase slug, `url` is http(s), and `hue` is one of `amber`, `violet`,
`blue`, `green`, `rose` or `teal`. An invalid file stops Harbour with a readable error.

Optionally, `searchConsoleProperty` names the product's Google Search Console property, in
either form Search Console uses: a domain property (`"sc-domain:example.com"`) or a URL-prefix
property (`"https://www.example.com/"`, ending in `/`). Without it, Search Console data for that
product shows as not connected; see [Connect Search Console](#connect-search-console).

Optionally, `tracking` chooses the searches and AI questions the weekly outside-view check asks
about each product; see [The outside view (Treg)](#the-outside-view-treg).

Optionally, `ownerName` (at most 40 characters: letters, spaces, apostrophes, dots and hyphens) is
used only as a first name in the daily note's greeting; it stays in this gitignored file and is
never logged.

Optionally `content` (see [Content machine](#content-machine)) turns the content machine on per product with its `terms`, and `content.projects` does the same for a project with no website.

Your product config and Second Brain are personal data: both are gitignored, and the brain
belongs in its own private repository.

## When things run

### Nightly backup

The worker backs up the database each night at 03:15 in `HARBOUR_TIMEZONE` (see
[Backups and restore](#backups-and-restore)). Like the checks it is worked out from the job
history: a restart never queues it twice, and a worker that was down at 03:15 queues that
night's backup at its first check; one that was down for several nights queues only the latest
night's, never one per missed night. A failed backup is tried again 10 minutes later, then 40
minutes after that; after three failures the worker waits for the next night. A backup the
worker's own stop interrupts counts as a failed attempt and is retried the same way; one you
cancel on **Agents** stays cancelled until the next night. A backup you queue by hand
(`pnpm backup:now`) counts as that day's. Set `HARBOUR_SCHEDULED_BACKUP=off` to
back up only by hand. The worker's start-up line says when the next backup is due. Each
verified backup then queues a retention job that prunes old check observations (see
[Data kept](#data-kept)).

### Daily checks

A visibility check is called a *check* on screen; the commands, API routes and settings keep the
older word *scan* (`pnpm scan:now`, `HARBOUR_SCHEDULED_SCANS`).

The worker queues a visibility check of every product each day at 06:00 in `HARBOUR_TIMEZONE`.
If the worker is down at 06:00, it queues the day's checks at its first check after it starts.
On start it also catches up: any product without a successful (or partly successful) check in
the last 24 hours is checked straight away. A product never has more than one check queued or
running, and the daily check is queued once a day however often the worker restarts. A daily
check that fails or that you cancel still counts as that day's: the next try is the following
day at 06:00, or the catch-up when the worker next starts. A catch-up that runs before 06:00
is still followed by that day's 06:00 check. Set `HARBOUR_SCHEDULED_SCANS=off` to queue checks
only by hand.

Checks are ordinary jobs: they run one at a time, in queue order, between agent runs. Unlike agent
runs they never wait for the brain to be quiet, because they don't touch it. To check now, choose
**Check now** on the product's page, or run `pnpm scan:now` (every product) or
`pnpm scan:now <productId>`; an unknown id is rejected with the configured ones. Both services read
`harbour.config.json` once, so after changing it restart them
(`systemctl --user restart harbour-worker harbour-web`) before checking. The **Sources** page shows
whether the daily check is on and when each product was last checked and will be next.

### Weekly analyst

The worker queues one weekly analyst run (see [Weekly analyst](#weekly-analyst)) each Sunday at
20:00 in `HARBOUR_TIMEZONE`, for that Sunday's ISO week. Like the daily check it is worked out from
the job history, so a restart never queues it twice, and a worker that was down on Sunday evening
queues exactly one run, for that Sunday's week, when it starts. A run you start by hand counts only
if you start it after Sunday's 20:00: one earlier in the week does not stop the full-week report.
The worker skips the week, and says so in its log, when `HARBOUR_CLAUDE_OAUTH_TOKEN` is not set
("weekly analyst skipped: no Claude token") or when no product has a scored check in the last 7 days
("no scan data this week"). A failed run is not retried automatically: choose **Write this week's
report now** on **Agents** or run `pnpm analyst:now`. Set `HARBOUR_SCHEDULED_ANALYST=off` to run it
only by hand. Like every agent run it waits for the brain to be quiet first.

### Daily note

Each day at `HARBOUR_NOTE_TIME` (default 06:30) in `HARBOUR_TIMEZONE` the worker queues one
`daily-note` job: an agent with a personality (a seasoned, warm, quick-witted friend with dry
humour and the odd harbour turn of phrase) writes the short note at the top of Today. It runs
on the same runner, git gate and Claude subscription as the other agents.

- **What it is given** — a small snapshot Harbour builds: the day, time and whether it is the
  weekend or out of hours (20:00 to 04:59); each product's scores, verdicts and changes; the
  active actions; wins in the last 24 hours; trouble (a failed data source or check, a stale or
  failed backup, worded as Today's briefing words it); the headlines of recent notes; and your
  first name if you set `ownerName` in `harbour.config.json`. No secrets and no file contents.
  The snapshot goes into the prompt as fenced, labelled data, because titles in it come from
  crawled pages.
- **What it writes** — one file, `notes/daily/YYYY-MM-DD-HHmm.md` (frontmatter: greeting,
  headline, mood, picks and, on a weekend or out of hours, a rest sentence; then the body). The
  agent has only the `Write` tool and writes a draft beside it; Harbour checks the draft and only
  then moves it into place. It is committed and pushed like every agent output
  (`agent(daily-note)` in the brain's git log), and it shows in the Second Brain.
- **What is checked before anything is shown** — the file is parsed with zod and rejected unless
  it is plain text within its length caps; every number and name is in the snapshot; every pick
  is the exact title of an action on the board; it has no exclamation-mark runs, shouting or
  pressuring words (hurry, urgent, behind, overdue, falling behind, failing, must, should have);
  it names a next step when there is trouble and claims none when there is not; it has a rest
  sentence exactly when it is rest time; and it only celebrates when there are wins. A rejected
  note is retried once with the reason fed back, in the same run; a second rejection fails the
  run (the reason is on its page on **Agents**) and Today shows the quiet gap. Nothing rejected
  is ever shown: Today shows a note only when a succeeded `daily-note` job vouches for its stamp
  and the file's content hash matches the one the checker accepted, so a file edited, added by
  hand or written by another agent afterwards is ignored.
- **What the checker cannot catch** — it is a net, not a proof. A single invented name used only
  as the first word of a sentence can pass (every sentence starts with a capital). A number is
  checked against all the numbers in the snapshot, so it can sit in the wrong place when it
  exists elsewhere in the facts. An invented name written in lowercase can pass. The wording of
  trouble, praise and quantities is matched by word lists, so unusual phrasing can slip through.
  Statements made only of known words are not verified: "Google changed its ranking rules
  overnight" passes, because every word is one the checker knows. The persona is told never to
  say why something moved or to claim a cause or an outside event, but that is a rule for the
  agent, not something Harbour can check.
- **Limits** — one run at a time, five minutes an attempt, one retry, and only the `Write` tool.
  It runs on your Claude subscription, so it is not in the cost ledger (which records paid API
  calls only); each run is in the **Agents** history with its prompt version.
- **When** — like the weekly analyst, the schedule is worked out from the job history: a
  restart never queues it twice, and a worker that was down at the time queues one note when it
  starts (a first start writes one straight away), stamped with the minute it is written, so
  "Written 14:00" on the card is true. A note you asked for after that time counts.
  A failed run is not retried automatically. Without `HARBOUR_CLAUDE_OAUTH_TOKEN` the worker
  skips it and says so in its log. `HARBOUR_SCHEDULED_NOTE=off` stops the schedule.
- **Write me a fresh one** — the button on Today queues a note now (one at a time, at most 5 a day;
  the scheduled note does not count). It says "Starting…", then "Writing a fresh one now" while it
  waits (it re-checks every 5 seconds, for ten minutes at most), and it stops waiting when its run
  ends: a succeeded run, or a failed one (the checker rejected the note twice, or the run broke),
  which it says calmly: "That note didn't pass Harbour's checks, so nothing was shown. You can try
  again." Every state is on `/design`. Today shows the newest valid note from the last 24 hours;
  older than that, or with none, it shows "No note yet today. The next one is written at 06:30." (or
  just "No note yet today." when the schedule is off or there is no token). The sample Today shows a
  fixed, labelled sample note.
- **Changing the personality** — edit `lib/note/persona/warm-friend.md` (the voice, the honesty
  rules, the format) and bump `NOTE_PROMPT_VERSION` in `lib/note/prompt.ts`. The rules the
  checker enforces are in `lib/explain/voice/`.
- **Quiet** — `HARBOUR_PERSONALITY=quiet` removes the schedule, the card and the ocean background.
- **Not pruned yet** — old notes stay in the brain (about 400 small files a year).

A celebrating note makes the front wave of the [ocean background](#ocean-background) rise once.

### Ocean background

Harbour is a harbour, so the lower half of every page is water: a soft fade to the horizon and
three wave layers (far, middle, near), each edged with a thin foam line, rolling sideways and
bobbing gently, each at its own slow pace (26 to 40 seconds a loop). It sits behind everything: cards, panels and text always stay on
top and keep their own background, and clicks pass straight through it. It shows on the sign-in
and setup pages too.

- **Calm by design** — pale sea-glass on the paper theme, deep teal water in the dark. Every text
  colour keeps WCAG AA contrast (at least 4.5:1, the usual readability bar) on every ocean colour,
  in light, dark and system dark; a test checks this, so a token change that hurts legibility fails.
- **Reduced motion** — with *Reduce motion* turned on in your operating system, the waves hold
  still as a still wave shape.
- **Cheap** — inline SVG and CSS only, no script; it moves by `transform` alone, browsers do not
  animate it in a hidden tab, and it is left out of print.
- **Turning it off** — `HARBOUR_PERSONALITY=quiet` (it also turns off the daily note). There is no
  separate setting.
- **Changing it** — colours are the `--ocean-*` tokens in `design/tokens.css`; shape, speed and
  phase are in `design/wave.ts`. Both are shown on `/design` under *Ocean background*.

### Monthly research refresh

On the first Sunday of each month at 21:00 in `HARBOUR_TIMEZONE` (an hour after the weekly
analyst, so that runs first) the worker queues refreshes of up to 3 stale research documents (see
[Research refresh](#research-refresh)). Each refresh job is labelled with its month, which is how
the worker knows the month's round has run: a restart never queues it twice, a worker that was
down over the slot queues one round, for the latest month, when it starts, and a round whose
refreshes failed is not retried until the next month (choose **Update old research** on
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

- **Where:** `HARBOUR_BACKUP_DIR` (a folder used only for backups), by default a `backups` folder
  next to the database (`data/backups`, inside the gitignored data folder). Files are named by local
  day, `harbour-YYYY-MM-DD.db`; a second backup on the same day replaces the first.
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
  the worker is not running), and when Harbour can't open the backup folder (check its
  permissions; the count is then unknown, not zero). Paths are never shown: an error names "the
  backup folder" instead.
- **Bounded:** a backup gives up after 10 minutes. **Stop this run** on **Agents** stops one in
  progress and removes the unfinished copy.

To restore one:

1. Stop both services: `systemctl --user stop harbour-worker harbour-web`.
2. Copy the chosen `harbour-YYYY-MM-DD.db` over the database file (`HARBOUR_DB_PATH`, by default
   `data/harbour.db`).
3. Delete the old `harbour.db-wal` and `harbour.db-shm` files next to it, if they exist: they
   belong to the database you replaced.
4. Start the web, then the worker: `systemctl --user start harbour-web`, then
   `systemctl --user start harbour-worker`.

### Data kept

Raw observations (every page, robots.txt and PageSpeed record a check stores) are most of the
database: a crawl alone stores up to 200 page records per product per day. After each verified
backup the worker runs a retention job that deletes the observations of old checks, so the file
stops growing. For each product (configured or not) it keeps:

- the observations of the newest `HARBOUR_OBSERVATION_SCANS_KEPT` checks (default 30, whatever
  their outcome) and of any check still running;
- the observations of each source's latest successful run, however old, so a weekly result
  such as PageSpeed still counts in later scores (only sources Harbour still has: a removed
  source's last run is pruned like any other old check);
- the observations of the check behind the latest scores, which the product page and the
  weekly export read.

Nothing else is ever pruned: check runs, collector runs (with how many records each stored) and
scores stay complete, so score history, trends and **Sources** never change, and nor do job
history, agent runs, actions or the audit log. A run deletes at most 2,000 rows per statement,
each statement its own short transaction so the web never waits long, and at most 500,000 rows
(from at most 500 checks) per night; the rest goes after the next night's backup. The job's
events on **Agents** say how many observations it removed per product.

Deleted space is reused by later checks rather than returned to the disk: Harbour never runs
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

One paid source is in use: **Treg** (`https://treg.to`), a pay-per-call catalogue of data APIs.
Once a week the `treg` collector asks it for each tracked product's links from other sites, its
position for each search you chose and whether ChatGPT names or cites it (a full run of 8
searches and 5 questions costs about US$0.08 per product per week, about A$1.60 a month for three
products, or A$2.45 if every call hit its price ceiling; fewer searches cost less; see
[Outside view](#the-outside-view-treg)). The monthly budget bounds the worst case. It makes **no calls** until you set
`HARBOUR_TREG_API_KEY`, a monthly budget and a `tracking` list. Other paid sources (DataForSEO,
OpenAI, Perplexity, Gemini) have no collector yet. The guard below means a paid collector can only
spend what you allow.

Treg charges in US dollars and the ledger is in Australian dollars, so Harbour converts both the
amount it reserves before a call (the endpoint's price estimate) and the charge Treg reports after
it (the `x-treg-cost-micro` header) with `HARBOUR_USD_TO_AUD`. Every call also carries a hard price
ceiling (about 1.5 times the estimate, never above US$0.05) that Treg enforces itself.

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
- **At 100 %** paid collectors are skipped until the 1st of next month (the check records them as
  "skipped — budget: …"). Free collectors, agents and everything else keep running.

The meter on **Today** says one of the lines below. Amounts follow `HARBOUR_LOCALE`'s currency
style: `A$12.40` in `en-GB` or `en-US`, `$12.40` in `en-AU`.

| Meter | Meaning |
|---|---|
| No paid data connected — Harbour is using free data only, so nothing is being spent | No paid source is connected (its key is missing). With spend earlier this month it reads "No paid data connected · A$1.23 spent this month". |
| Paid data is off until you set a monthly budget — how to set one | A paid source is connected but the budget is 0. |
| A$12.40 of A$60.00 this month · on track for A$31.00 | Spend so far, the budget and a straight-line month-end projection (from the second day of the month). |
| … with "80 % of budget" | You have used at least 80 % of the budget. |
| Budget reached — paid data is paused until 1 Nov. Free checks carry on as normal. | Paid collectors are skipped until the next month starts. |

## The outside view (Treg)

Besides what Google tells you, Harbour asks how the rest of the web sees each product. Once a
week the worker's `treg` collector makes up to three kinds of paid call to
[Treg](https://treg.to), a pay-per-call catalogue of data APIs:

1. **Links to you**: how many other sites link to your domain (about US$0.0025). The provider counts
   your own pages linking to each other as a linking domain, so for a site with 25 linking domains
   or fewer Harbour makes one more call that lists them (US$0.0005 a row, at most US$0.0125) and
   leaves your own domain and its subdomains out. The page then says "(your own pages not counted)".
   One odd row does not spoil the list: a row that is not a plain host name is left out and counted
   in the run's tally, a missing page count is 0 and a domain listed twice counts once. If the call
   fails, or no row can be read, the first count is kept without it and the product page does not say so.
2. **Where you rank**: your position on Google for each search you chose, looking down to
   position 30 (about US$0.006 each). "Not in the top 30" is stored as such, never as a number.
3. **AI answers**: whether ChatGPT names or cites your site when asked each question you chose
   (about US$0.0036 each). Only the verdict is stored; the answer text is never kept.

Each check is independent: one failing never hides the others. Nothing is called until you
(a) put `HARBOUR_TREG_API_KEY` in `.env`, (b) set `HARBOUR_MONTHLY_BUDGET_AUD` above 0 (A$10 is
plenty) and (c) choose what to track in `harbour.config.json`:

```json
{
  "tracking": {
    "products": {
      "acme-docs": {
        "queries": ["acme docs", "best documentation tools for small teams"],
        "questions": ["What are good tools for writing team documentation?"],
        "location": "Queensland,Australia",
        "country": "AU",
        "languageCode": "en"
      }
    }
  }
}
```

- `queries`: up to 8 searches to find your rank for. `questions`: up to 5 questions to put to an
  AI assistant. Each is 3 to 160 characters of plain visible text (no control or hidden
  characters) and unique in its list.
- `location` (optional, e.g. `"Queensland,Australia"`) is where the searches are made from.
  `country` (an ISO 3166 two-letter code, default `AU`) is the AI check's country and
  `languageCode` (default `en`) the search language.
- Every id must be one of your `products`; a typo is an error, not ignored. A product with no
  entry shows "No searches chosen yet", not a zero.
- Keep your real searches in your own `harbour.config.json` (it is gitignored), never in the
  repository.

Every call carries a hard price ceiling and is checked against the budget first. A call Treg
prices above the ceiling is skipped (that check shows "price above our ceiling") and the rest
carry on; an empty Treg balance or a refused key stops the run; a rate limit stops it with what
it has. Failed calls are recorded, not retried. The week's tally is stored with the results.

### What you see, and Run this check now

Each product's page has a **How the web sees you** section: how many sites link to you and how that
changed since the last check, your position on Google for each search you chose ("Position 4" or
"Not in the top 30", with up, down or same since last time) and what ChatGPT said ("ChatGPT named
you in 1 of 5 answers; sites it cited most: …"), with the date of the last check. One plain line is
always visible; the numbers behind it are under **Technical details**. Anything not measured says so
("Not checked yet", "No searches chosen yet", "Treg isn't connected", "Paused: balance or key",
"Skipped: this month's budget is used up"); it is never shown as a zero. Everything from stored data
is shown as plain text, never as a link.

**Run this check now** (owner only) asks the worker for a check of that product right away, beside
the weekly one. It is a normal job (`outside-check`, shown on Agents as "Check how the web sees
you") that runs only the Treg collector through the same budget guard. It does not make a scan, so
scores are untouched. Limits, counted from the jobs table in your local day: a second click while one is queued or running
returns the same job (before any limit); otherwise at most **one check per product every 6 hours,
3 per product a day and 4 a day across all products**, and none once Treg has used **70 % of this
month's budget** (the rest is kept for the weekly checks). A manual check does not count as the weekly
run: the scheduled check still runs when it is due. A refused request says why in plain words (no searches chosen, Treg not connected, this month's
budget used up, too soon, daily limit). A manual check ignores the weekly rhythm and the two-day
wait after a failed paid run, but never the budget. If Treg refused the key the worker stays paused
until it restarts; an empty balance pauses it for a day, and a manual check ignores that pause (you
may have topped up) and ends it when at least one of its checks is answered.

When a run answers only part (the budget ran out, Treg was paused, it stopped answering, or some
checks didn't work) the section says "Partly checked: …" and why. The Actions board catches up at the
next scan's rule sync after a manual check; the product page's issue list judges the history at once.

Results are kept in the `external_checks` table (one row per links, position or AI check, written by
the worker after the check, only if it passes its shape; 400 days, pruned by the nightly retention
job; the actions read the last 60 days and the page shows the last 120), so a trend is visible long after the scans' own observations are pruned. Take a backup before
updating Harbour: the migration only adds this table.

Two actions can come from it, in the Actions board and on the product page, and they never change
the scores: **Other sites rarely link to you** (fewer than 5 sites link to you at the latest check;
resolves at 5 or more) and **AI assistants don't mention you yet** (at least 5 questions checked over
the last two weekly checks and none named or linked to you; resolves when any does). Each stays
unknown, never opened or closed, while the data is missing or too thin.

The collector rides along with the daily check but runs only when about a week has passed since
its last successful run, so Job events read `Outside view: skipped — runs weekly; last ran
2026-10-01` on the other days. A run that could not answer anything is a failure, not a week's
success, so it is tried again at the next daily check. With no budget set, a check reads
`skipped — budget: …`. The key is read only by the worker and is never shown, logged or stored;
the Treg address is fixed in code and Harbour refuses to follow a redirect from it.

## Reading the results

- **Today** (`/`) gives every product a verdict per area. A missing score reads "No score yet"
  with the reason (a gap, never a zero); an asterisk marks a verdict where some data was
  missing because a source was not connected or failed, and the numbers are under **Technical
  details**. Each product name opens its page. While a check is queued or running, the page
  refreshes itself. **Next up** shows the top three open or in-progress actions (in
  the Actions board's order), each linked to its card and saying who's on it (Claude is on it,
  Pull request waiting for your OK, Waiting for you to look it over, or Waiting for you), and the
  briefing's second line counts
  every one of them; the rest are a link away on the Actions board. Before the first check is
  scored, Today shows clearly flagged sample data instead.
- **Product page** (`/products/<id>`) opens with the three area cards and a one-line summary (for
  example "Acme Docs is in fair shape. Weakest: Answer-ready (needs work)."), plus a note on where
  checking stands (never checked, queued, running, or how the last check ended, in one sentence; a
  failed check never hides the last good results, and the raw error sits under **Technical
  details**). Each area's tab explains every sub-score as a plain sentence, weakest first, with
  "What's this?"; one with no data reads "Not counted yet" with the reason and is left out of the
  score rather than counted as zero. **What to fix** lists the check's issues with plain titles (the
  rule titles in `lib/scan/issue-rules.ts`, such as "No guide to your site for AI assistants"); the
  exact fix and check text and the affected URLs sit under **Technical details**. Issues come from
  the check's raw observations: pages without a title or meta description, broken internal links,
  pages hidden by noindex, AI crawlers blocked in robots.txt, no llms.txt, no FAQ structured data
  and no Google Preferred Sources button, and (once Search Console is connected and Harbour has known
  the sitemap for 14 days) at least 3 pages, and a fifth or more of those checked, that Google hasn't
  added to its search results. An issue is raised only from collectors that ran ok in
  that check: when the crawler or readiness check failed, its issues are unknown rather than fixed.
  The same goes for a page check that found nothing on a partial crawl (stopped at its page or byte
  limit, or some pages could not be fetched or read). **Hand to Claude** copies a prompt with the
  product, the affected URLs, the problem, a suggested fix and an acceptance check, to paste into
  Claude Code in the site's repository; it contains only the product's name and URL and the check's
  findings. Each issue also shows its action's status (to do, in progress, snoozed until a date,
  dismissed, or done but still found in the last check) with a link to it on the Actions board; an
  issue with no action yet says tracking starts with the next check. **Pages Harbour checked** is a
  one-line verdict; the table of the 50 crawled pages with the most problems sits under **Technical
  details**. **Pages in Google** is its own panel beside **Found on Google**, with one unscored line, such as "In Google: 3 of 53 pages", and a
  one-sentence explainer; the breakdown by what Google says sits under **Technical details**. Without
  data it says why ("Search Console isn't connected", "Google's daily limit was reached", "Checking, 20 of 53
  so far") and never shows 0; pages Google couldn't answer for are listed beside the count.
  The Google Search Console and paid-data panels say in plain words whether they are
  connected and what they show. Search Console also says how to connect it; the paid-data panels say
  Harbour doesn't collect that data yet. Setting names appear only under **Technical details**
  (Search Console's raw reason), as do its top searches. Actions created before a title was reworded
  keep the old title until the next check finds the issue again; open, in-progress, snoozed and
  dismissed actions then take the new title, and an action already resolved keeps its old one.
- **Actions** (`/actions`) follow every check that is not failed: each issue becomes one tracked
  action per product and rule. The next check that no
  longer finds the issue marks its action done, with a dated note; if the issue comes back, or
  you marked an action done while the check still finds it, the action reopens. A dismissed
  action stays dismissed while the issue persists and reopens only if the issue clears and
  later returns. A snoozed action stays snoozed until its date even while the issue persists,
  and is marked done if the issue clears. When a rule could not judge a check (its collector
  failed, or the crawl was partial), its action is left exactly as it was: missing data never
  creates, resolves or reopens an action. The check's job log ends with how many actions were
  new, resolved and reopened; if this step fails the job is marked failed with the reason, the
  check and its scores are kept, and the next check tries again; until it does, the Actions page
  says the list may be out of date, that the last check finished but couldn't update the actions
  (with the time), and that the next check tries again. Reasons are written in plain words;
  actions raised before a wording change keep the old text until the next check refreshes them.
- **The Actions list** (`/actions?view=list`, the older view of the same jobs) shows Backlog and In progress actions by default, grouped Big wins → Worth
  doing → Small wins, in-progress first, then the smallest effort. Filters (product, area,
  status) are a normal form, so a filtered view can be bookmarked; at most 200 actions are shown,
  with a count of the rest. Each card offers only the moves its status allows (**Start**,
  **Mark done**, **Snooze…** with a date from tomorrow to a year ahead, **Dismiss**, **Move back
  to Backlog**, **Bring back now**, **Restore to Backlog**; new ideas from the weekly analyst are
  **Accept**ed or **Dismiss**ed). **History** lists every change with who made it (**You**,
  **Claude**, **Harbour's check**…) and its note; a card whose fix has a pull request links to it
  (**Pull request owner/repo#42**, in a new tab). **Hand to Claude** copies a prompt with the
  problem, evidence (fenced as data), fix and acceptance check, and sits under **Technical
  details** on each card, which remembers whether you opened it. When agents have proposed
  research targets, a link per product leads to its settings page to approve them.
- **Sources** (`/settings/sources`) shows each collector's latest run per product (ok, failed,
  not connected or skipped) with its reason, and whether PageSpeed and Search Console are
  connected — as connected or not, never the key or the credentials.

## Actions board

`/actions` shows every job Harbour has found for your products as a board: one card per job, in
six columns that read left to right as the job's life.

| Column | In plain words |
|---|---|
| Backlog | Ideas and jobs nobody has picked yet (new ideas from the weekly review sit here, tagged **New idea**) |
| Queue | Decided, and next up |
| Started | Someone has begun |
| In progress | Being worked on now |
| In review | Finished, and waiting for a look (a job with a pull request is always here) |
| Done | Finished in the last 14 days |

Each card says what the job is, why it matters, who is on it, what it waits for, what happens next
and the last move. A card says **Stuck** when nothing has changed for more than 7 days in Started or
In progress, or more than 3 days in In review. Each column has a "What's this?" that explains it.
**Snoozed** cards and cards **dismissed** in the last 14 days are not columns: they sit in the
**Parked** strip under the board, where **Bring back now** or **Restore to Backlog** puts them back.

**Moving a card.** Drag it into another column, or use the card's **Move to…** button, which works
from the keyboard and on a phone: press Enter to open the menu, the arrow keys to choose a column,
Enter to move and Escape to close it. The move is announced ("Moved … to Queue") and focus returns
to the card. If Harbour refuses a move (the card was moved a moment ago, or it has a pull request
and you chose In progress) the card snaps back and a plain sentence says why. A card can go to any
column except that a new idea cannot go straight to Done: **Accept** it first (the menu leaves
Done out for a new idea), or move it to Queue.

**The Today strip.** Today's **Where the work is** band shows a tile per column with its count, a
bar of how the jobs are spread, how many are stuck, how many need you (new ideas, pull requests
waiting for a look, and your own work in Started, In progress or In review) and what moved today.
Each tile opens that column on the board; **See the stuck jobs** and **See what needs you** open the
board narrowed to those cards, with a line at the top and a **Show everything** link to clear it.

**From the terminal.** Claude keeps the columns true with `pnpm actions move <id> <column> --from
<column> --note "why"`, filters with `pnpm actions list --column queue,started` and creates a card
straight in a column with `pnpm actions add --column queue …`; see "Let Claude triage the board".
The list view (`/actions?view=list`) and the board share one set of rules.

## Let Claude triage the board

`pnpm actions` lets Claude, running in a Claude Code session on the Harbour host, work the
Actions board as your expert: accept or dismiss suggestions, start, finish or snooze actions,
and link the pull request that fixes each one. Every change goes through the same rules as the
board's buttons and lands in the action's history as **Claude**, with the reason Claude gave, and
in the audit log (without the reason). You review the decisions on the board afterwards and can
reopen or move anything back. It is a tool run on the host, not a worker agent: the worker's
agents still only suggest.

```bash
pnpm actions list [--product <id>] [--status open,in_progress | --column queue,started] [--json]
pnpm actions show 12
pnpm actions set 12 in_progress --from open --note "Fixing the page titles in acme/widget#42"
pnpm actions set 12 snoozed --from open --note "Wait for the redesign" --until 2026-11-01
pnpm actions move 12 in_review --from started --note "Pull request acme/widget#42 is open"
pnpm actions link 12 https://github.com/acme/widget/pull/42
pnpm actions link 12 --clear
pnpm actions add --product acme-docs --title "Rewrite the Acme Docs page titles" \
  --why "Pages without a clear title are skipped by search and AI answers." \
  --area SEO --impact high --effort small --fix "Give each page a title under 60 characters" \
  --evidence "https://docs.example.com/start has no title" --doc https://example.com/title-guide
```

- **list** shows suggested, open, in-progress and snoozed actions by default (at most 500), one
  per line: `#id  product  area  status  impact/effort  title  [PR]`. `--status` takes one or more
  statuses (`suggested`, `open`, `in_progress`, `done`, `snoozed`, `dismissed`); `--column` takes
  one or more board columns instead (`backlog`, `queue`, `started`, `in_progress`, `in_review`,
  `done`; snoozed and dismissed actions are in no column); `--json` prints
  `{"note": "...", "actions": [...]}` with the full actions.
- **show** prints every field, the evidence, the history and the **Hand to Claude** prompt.
- **set** needs `--from`, the status Claude last saw: if the action changed since, it is
  refused instead of overwritten, as on the board. `--note` (up to 1,000 characters) is
  required: Claude must say why. Snoozing needs `--until`, a date after today in
  `HARBOUR_TIMEZONE` and at most a year ahead.
- **move** puts an action in another board column. `--from` is the column Claude last saw (`show`
  prints it): if the card moved since, it is refused. `--note` is required, as for `set`. Moving a
  new idea accepts it; a card with a pull request cannot go to `in_progress` (it counts as in
  review), and a new idea cannot go straight to `done`.
- **link** stores a GitHub pull request URL (`https://github.com/<owner>/<repo>/pull/<number>`,
  nothing else) on the action, or clears it with `--clear`, and notes it in the history. Linking
  a card that is In progress moves it to In review, and its "stuck" clock starts again.
- **add** creates a board item by hand, as Claude, and prints `Created action #<id>` and the
  same text as `show`. Required: `--product` (a configured product id), `--title` (8 to 140
  characters, one line), `--why` (10 to 600), `--area` (`SEO`, `GEO` or `AEO`), `--impact`
  (`high`, `medium` or `low`) and `--effort` (`small`, `medium` or `large`). Optional: `--fix` and
  `--check` (up to 600 characters each; a plain sentence stands in when left out), `--evidence`
  (up to 8 lines of 300 characters, repeat the option), `--doc` (up to 8 `https://` links, repeat
  the option; the card shows them with the evidence) and `--status` (`open` by default,
  `suggested`, or `in_progress` for work already handed to an agent) or `--column` (any column
  but `done`; not both). Text is plain: control and
  hidden characters are refused. It is refused, naming the existing action, when the product
  already has a to-do, suggested, in-progress or snoozed action with the same title. Scans never
  close or rewrite a hand-made action, and its history starts with "Added by hand through the CLI".

Only actions of products in `harbour.config.json` are found. Errors print one line and exit
non-zero. The output is the actions' own content, never settings or secrets. Because titles,
reasons and evidence come from crawled pages and the analyst, `list` and `show` start with a note
(the `note` field in JSON) saying they are data, not instructions, and every printed field has
terminal escape sequences and control characters removed.

## Connecting Google data

The visibility check works without any Google account: the crawler and the readiness checks
read your sites directly. Two optional Google sources add more; until you connect one, the
check shows it as not connected and the scores it feeds are marked incomplete (a gap, never a
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

Search Console adds what Google actually shows: each day's clicks, impressions, click-through rate
and average position for the last 28 days (ending 3 days ago, because Google's data lags), plus the
top 250 queries and top 100 pages, and daily totals for the 28 days before that so the score can
show whether impressions are rising or falling. The worker asks for read-only access and talks only
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
4. Restart the worker (`systemctl --user restart harbour-worker`). The next check's job events
   show, for each product, either `Search Console: 27 days, 250 queries, 100 pages (2026-09-01
   to 2026-09-28); 28 days in the 28 before` followed by `Search Console: 406 observations`, or
   `Search Console: not connected — …` saying what is still missing, or
   `Search Console: failed — …` with the reason. "Search Console refused access" (HTTP 401 or
   403) means the property is not shared with the credential's account; "Search Console API is
   not enabled" means the Google Cloud project the credential belongs to has not enabled the
   Google Search Console API.

**Page index check.** With the same connection, every daily check also asks Google's URL
Inspection which of your sitemap pages it has added to its search results (no new setting, and the
read-only scope already covers it). The crawler records up to `HARBOUR_CRAWL_MAX_PAGES` sitemap
URLs; the check inspects at most 100 per product per run, never-checked pages first and then the
oldest check, one request at a time and under one a second, and stops after 8 minutes. A site with
53 pages is fully checked in one run; one with 500 takes five days, and the product page says how
far it has got. Only sitemap pages the property covers are checked: a domain property covers
the host and its subdomains, a URL-prefix property its exact address and path, and if none fit the
check says the property doesn't cover the site. A page that failed is retried first but at most
once a day, and goes behind the others after two failures in a row. Each run carries earlier
results forward, so a page keeps its last known status until it is checked again. If Google says
the day's quota is used up, Harbour keeps what it has ("wait for tomorrow's check"); a page that
could not be checked is recorded as unknown, never as not indexed. Job events read `Indexing: Asked Google about 53 pages: 53 of 53 now have a known
status`, or `Indexing: not connected — …`. Scores are unchanged.

Never set `GOOGLE_SDK_NODE_LOGGING` for the worker: it makes Google's auth library log its
requests and responses, access tokens included.

## How scores work

After each check Harbour turns the raw observations into three scores from 0 to 100: **SEO**
(classic search), **GEO** (being used and cited by AI assistants) and **AEO** (being the direct
answer). Each score is the weighted mean of its sub-scores, and every sub-score keeps the
evidence behind its number, so the product page can explain it.

| Score | Sub-score (weight) |
|---|---|
| SEO | Technical health (35%), indexability (25%), Core Web Vitals (20%), search impressions trend (20%) |
| GEO | AI crawler access (30%; AI search and answer agents count three times as much as training-only crawlers), llms.txt (15%), entity structured data (25%), citation-ready content (30%) |
| AEO | FAQ, HowTo and Q&A coverage (40%), concise answer blocks (35%), **Fresh pages** (25%: 3 or more URLs updated in the last 30 days score 100; a `news` site (see `kind` in [Configuration](#configuration)) instead gets 50 points for a Google Preferred Sources button and 50 for fresh content, as in formula v1) |

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
- **Scores never change after they are stored.** Each row records its formula version (`v2` now);
  a formula change gets a new version rather than rewriting history. A change in an area's score
  is not shown across a formula version that changed that area (v2 changed only Answer-ready on
  product sites), so the first check after the change has no change beside that one score, and the
  daily note and the weekly report never call it an improvement or a decline. The weekly report's
  data labels each score with its version, and the 30-day SEO trend line keeps its older points as
  they were.
- **Preferred Sources only counts for news sites.** It is a Top Stories feature, so the "No
  favourite-source link for Google readers" action is raised only for `kind: "news"` products; one
  still open on any other product moves to Done at its next check, with the ordinary note "Resolved
  — not found in the check of <date>". For about 30 days after formula v2 first scores a product
  site, its page says "Scoring updated: Preferred Sources now only counts for news sites." so a move
  in the score is not mistaken for a change in the site.

The exact formulas, thresholds and rounding are in the Phase 3 plan's "As built — scoring" notes
([docs/superpowers/plans](docs/superpowers/plans/2026-10-02-phase-3-visibility.md)), which
describe formula v1; the AEO change in v2 is in
[the plain-language spec](docs/superpowers/specs/2026-10-02-plain-language-ux-design.md) §6.

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
`http://127.0.0.1:3402` (keep ports 3401 to 3405 free; 3403 is a second web server with
`HARBOUR_PERSONALITY=quiet` for the note specs, 3404 a fake Screenpipe for the content specs and
3405 a fake Treg for the outside-view specs, which the end-to-end worker (`tests/e2e/worker.ts`) points at, so
the real service is never called), and the E2E product config
(`tests/fixtures/harbour.config.e2e.json`) points Acme Docs at it. Scheduled checks are off; the
scan specs choose **Check now** and check the product page, Sources and Today on the real results.
Only this environment may check a loopback address (`HARBOUR_TEST_MODE` and
`HARBOUR_SCAN_ALLOW_LOOPBACK`, both refused outside tests).

The shell, scans, actions, note, agents, content and settings specs also check that the pages they visit
(Today, product pages, Actions, Settings, Agents and a run page, Sources) speak plainly: no SEO,
GEO or AEO heading, no `HARBOUR_*` setting name or sub-score key, and not the word "scan" outside
**Technical details** (`tests/e2e/plain-language.ts`).

The note specs choose **Write me a fresh one** against the fake CLI, which reads the fenced facts
out of its prompt and writes an honest note, and the wave specs check that the wave is hidden from
assistive technology, passes clicks through, shows on the sign-in page without widening it, is
left out of print and stops under emulated reduced motion. `design/wave-contrast.test.ts`
computes every text colour's contrast on every ocean colour from `design/tokens.css`.

The Playwright projects run in order — the shell and brain specs, then agents, scans, actions, the
weekly analyst, the note, content and finally operations (Settings) — because each later one changes what the
earlier ones check. The actions specs seed a scored check of the fictional Lighthouse Café and two
analyst suggestions through Harbour's own code (`tests/e2e/seed-actions.ts`), then work the Actions
list view: filters, status changes, snooze, **Hand to Claude** (read back from the clipboard), Today's
top three, keyboard paths and both themes. The board specs (`tests/e2e/board.spec.ts`, run last)
seed six cards of the fictional Fern & Field (`tests/e2e/seed-board.ts`) and check the six columns
and counts, a keyboard move with its announcement and focus, a drag move, a refused move and
Today's strip links. The analyst specs choose **Write this week's report now**
twice (the scheduled analyst is off, `HARBOUR_SCHEDULED_ANALYST=off`): the first run commits the
report and imports a suggestion, the second finds it already known.

The content specs (`tests/e2e/content.spec.ts`) run the whole content machine with no real agent and no
real Screenpipe: the fake CLI answers each step from `tests/fixtures/content/chain-works.json`
(generated by `tests/e2e/prepare.ts`) and a fake Screenpipe serves invented snippets. They make a
digest and an idea through the page, press **Write this**, check that five pieces end Ready and one
Needs you, that Copy puts clean text on the clipboard, that Approve exports a markdown file and
audits it (and asks "Approve anyway?" for the piece that needs you), and that Edit and Discard
work, and that no job name, file path or setting name shows outside **Technical details**. The
adversarial fixtures from the spec (hostile screen text, a canary string, hostile agent output,
invented numbers on every platform, hostile or missing skills, an edit during a run, and approval
that only the owner can give) run as unit tests in `lib/content/adversarial*.test.ts`.
`lib/config-docs.test.ts` checks that every setting in `lib/config.ts` is in this README's table
and in `.env.example`.

The operations specs (`tests/e2e/settings.spec.ts`) check the Settings page — products, every
schedule shown as off, key status without values, the A$0.00 budget — then choose **Back up
now** and **Update old research**. Every schedule is off in this environment
(`HARBOUR_SCHEDULED_SCANS`, `_ANALYST`, `_RESEARCH`, `_BACKUP`, `_NOTE`, `_DIGEST` and `_IDEAS` all `off`), so only these
clicks queue work. `HARBOUR_BACKUP_DIR` is unset, so the backup lands in `data/e2e/backups`,
which each run recreates; the specs check its file and folder modes and that the retention job
follows.

## Project structure

```
app/          routes (thin: parse input, call lib/, render)
components/   UI components built on semantic tokens
design/       tokens.css (primitives + semantic), the token list for /design, the wave and contrast maths
lib/          auth, agents, brain, config, content (the content machine: schemas, checks, worker steps, page reads), costs (ledger, budget), db, jobs, note (the daily note), ops (backups), products, security, formatting — logic + tests
skills/       the atomizer skill the content machine pastes into its runs (`pnpm skills:install`)
worker/       the job worker (`pnpm worker`): agent runs, checks, backups, autosave and push retries
deploy/       systemd unit template, install script, deployment guide
drizzle/      SQL migrations
scripts/      repo checks and the setup-token, initial-run, scan-now, analyst-now, backup-now, retention-check, gsc-connect, actions and skills-install CLIs
tests/        e2e specs and test helpers
docs/         design spec and implementation plans
```

## Design docs

The design spec lives in [docs/superpowers/specs](docs/superpowers/specs) and the Phase 1
implementation plan in [docs/superpowers/plans](docs/superpowers/plans). Contributor rules
are in [AGENTS.md](AGENTS.md).

## Licence

[MIT](LICENSE)
