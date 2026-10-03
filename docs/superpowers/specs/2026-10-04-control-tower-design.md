# Control tower — design

Status: requested by the owner in conversation, 3 October 2026; written for owner review.
Amends: `2026-10-02-plain-language-ux-design.md` §5.1 (Today), `2026-10-02-warm-friend-design.md` §4
(where the note card sits) and `2026-10-01-harbour-design.md` §9 (UI surfaces).
Builds on: `2026-10-04-actions-board-design.md` (the Board and its Today work strip, built separately).

## 1. Intent

The owner, in their words: Harbour "should feel like something similar to a control tower for airport
controllers. It should just have everything right in your face or just a click away and I should never
have to try to learn what something means." And: "I can look at the app in my day, know exactly where
we are, and behind the scenes the main agent is the boss controlling the agents and projects and
ensuring the status is correct for all projects."

**Success:** without asking a question, the owner opens Harbour and knows where we are. In under ten
seconds they can answer, in this order:

1. Is everything OK?
2. What needs me now?
3. Where is the work?
4. How is each product doing?
5. What are the agents and jobs doing, and what finished?
6. What got better?

Every word on the page is either plain or explained in place, one hover, tap or key press away.

**Feel:** calm, friendly and flowing. Cards, small status lights, one or two tiny graphics, gentle
motion that means something. Fun comes from warmth and visible wins, never from noise.

**Reading needs** (AGENTS.md, "Communicating with the owner"): lead with the point, one thing at a
time, short sentences, lists capped at 5, wins visible, no walls of text.

## 2. What each screen tells the owner today

An honest inventory of `d778221`.

| Screen | What it tells the owner | What it fails to say |
|---|---|---|
| Today (`/`) | Daily note; date and "last checked"; the briefing (site health, biggest opportunity, counts); verdict table per product; three next actions; spend, backup and data-source notices at the bottom. | Whether the worker is running (only hinted at by a stale backup). Whether scheduled jobs ran. What agents are doing now or did today. Content waiting for the owner (only a sidebar badge). Indexing and outside-view facts (only on each product page). Wins and progress (only if the note mentions them). It refreshes only while a check runs. The calm notices sit last, so trouble is read last. |
| Product page | Three area cards, summary, sub-scores weakest first, what to fix, pages in Google, outside view, Search Console, sources. | Rich, but one product at a time. The one next action and the product's work in flight are not on it. Content for the product is elsewhere. |
| Actions | Grouped list of actions by impact, filters, who's on it, PR links (the Board replaces this view). | Where work stands as a flow (the Board fixes this). What is stuck. |
| Content | Ideas and pieces in six tabs; what needs the owner; Copy, Approve, Edit, Discard. | Nothing about content shows anywhere else except the sidebar count. |
| Agents | Run buttons, weekly report, research refresh, Second Brain sync, the last 30 runs. | What is running right now, in one line. What finished well today. Runs read as a log, not as a story. |
| Second Brain | The notes, search, recent docs. | Fine for its job. Not a status surface. |
| Settings | Products, schedules with next runs, connections, budget, backups. | Whether each schedule's last run worked. Whether the worker is alive. |
| Sources | Check schedule, connections, each source's last run. | Fine for its job; not summarised anywhere. |
| Devices | Passkeys. | Fine for its job. |
| `/design` | Tokens and examples of every component. | Has no tower examples yet. |

The pattern: Harbour knows almost everything the owner asks, but spreads it across seven pages and
puts trouble last. The tower brings the answers to one page, in the order the owner asks them.

## 3. Principles

1. **Answer in order.** The home page reads top to bottom as the six questions in §1. Nothing jumps
   the queue except the headline, which summarises them.
2. **Lead with a sentence, keep the number small.** (Plain-language spec, principle 1.) Every tile's
   first line is a plain sentence; numbers and graphics sit beside it.
3. **Everything is one click away, nothing is two.** Every tile links to the page where the owner
   acts. Every item in "Needs you" has exactly one button.
4. **Never learn a word.** Every unavoidable term is a `<Term>` with an explanation in place. Every
   page has "What's this page?". The explanation is never the only place information lives: a term
   tip explains a word, it never carries a fact the page needs.
5. **Lists stop at 5.** Longer lists show the top 5 and "N more" as a link.
6. **Wins are visible.** Wins come before trouble inside the activity feed, and have their own tile.
7. **Missing data is a gap, never a zero.** A tile that cannot read its data says so in plain words
   and the rest of the page still renders.
8. **Calm motion only.** Motion marks something live or new, runs once or slowly, and stops entirely
   under reduced motion.

## 4. The Tower home (`/`)

The route stays `/` and the sidebar label stays **Today**: a plain word the owner already knows.
"Tower" is the design's name and the code's folder name (`components/tower/`, `lib/tower/`); it never
appears on screen.

### 4.1 Layout, top to bottom

```
┌ Header ─────────────────────────────────────────────── [What's this page?] ┐
│ h1  "Everything is running. 2 things need you."                            │
│     Friday 4 October · updated 09:42 · On this page: Systems · You · Work … │
├ (a) Systems ────────────────────────────────────────────────────────────────┤
│ ● Website  ● Worker  ● Schedules  ● Checks  ● Backups  ● Sources  ● Agents  ● Spend │
│ "All eight are fine." (or the non-fine ones, each with its sentence)        │
├ (b) Needs you ────────────────────────┬ Daily note (warm only) ─────────────┤
│ 1. Pull request waiting  [Review]     │ Morning. The tide's in your favour… │
│ 2. 3 new ideas to decide [Decide]     │                                     │
├ (c) Where the work is — the Board's work strip ─────────────────────────────┤
├ (d) Your products ─ briefing sentence ──────────────────────────────────────┤
│ [Acme Docs runway card] [Acme Blog runway card] …                           │
├ (e) What's happening ─────────────────┬ (f) Wins this week ─────────────────┤
│ Running now · Finished (wins first)   │ 4 cards done · Found on Google up 6 │
└───────────────────────────────────────┴─────────────────────────────────────┘
```

Widths: `max-w-6xl`, one column below 768 px, two columns from 1024 px where shown. Section order in
the DOM is the reading order in §1 at every width.

### 4.2 Header

- **h1, the tower headline**: one sentence from `towerHeadline()` in `lib/explain/tower.ts`, built
  from the systems summary and the needs-you count. Examples: "Everything is running. 2 things need
  you." / "Everything is running. Nothing needs you right now." / "The worker isn't running, so
  nothing new will happen. 1 more thing needs you." A red system light always leads the sentence.
  A light that is only worth a look (or that Harbour can't read) never reads as "Everything is
  running": the lead becomes "Nothing is broken. 1 light is worth a look." A tile that could not
  be read is said, never guessed ("Harbour couldn't read its systems just now."). The second
  sentence (what needs you) is the polite live region (§10).
- **Sub-line**: the long date, "updated HH:MM" (the server render time), and an **On this page**
  jump list of the six sections (in-page links, so the keyboard can jump straight to a section).
- **What's this page?** at the right (§6.3).
- The briefing sentence from the plain-language spec moves to lead section (d), where it describes
  the products. It keeps its words and its tests.

### 4.3 (a) Systems strip: is everything OK?

Eight status lights, each a small icon plus a one-word label, in a fixed order. Under the row, one
sentence: "All eight are fine." when every light is `ok`; when nothing needs a look but some are
working or switched off, it names them ("Nothing needs a look. Working now: Checks. Switched off:
Backups."); otherwise each light that is not fine shows its plain sentence (at most 5, worst first,
"N more" beyond). Any light can be opened (a disclosure) to read its
sentence and a link to where to act.

| Light | Fine when | Sentence examples | Reads | Links to |
|---|---|---|---|---|
| Website | Always, when this page rendered | "Harbour's website is up. Running since Tuesday." | process start time (module constant) | — |
| Worker | Beat or running-job heartbeat within 2 min | "The worker is running." / "The worker hasn't checked in for 6 minutes." / "The worker isn't running, so checks, backups and agents are waiting." | new `worker_status` row (§7.1); `jobs.heartbeat_at` of a running job | README deploy steps |
| Schedules | Every enabled schedule's latest due run finished ok | "All 6 schedules ran on time." / "The weekly report didn't run on Monday." | `scheduleRows()` (extracted from `lib/settings/view.ts`), latest `jobs` row per kind | `/settings` |
| Checks | Newest check within 26 h and it finished | "Checked 3 hours ago." / "Checking your sites now." / "The last check for Acme Docs didn't finish." | `productToday()` per product (`lib/today/from-scans.ts`) | `/settings/sources` |
| Backups | Backup health `ok` and the Second Brain has nothing unsaved for over an hour | "Backed up at 02:10. Notes saved." / the existing backup notice sentences | `backupStatus()`, `brainSyncStatus()` | `/settings#backups` |
| Sources | No data source failed in each product's last check | "All data sources answered." / `sourceTrouble()` sentence | failures from `productToday()` | `/settings/sources` |
| Agents | No agent run failed in the last 24 h without a later success of the same kind | "Claude is writing the daily note." / "Nothing running. 3 runs finished today." / "The ideas run didn't finish." | `jobs` running, queued and finished in 24 h; `jobLabel()` | `/agents` |
| Spend | Cost meter state `ok`, `no-paid-sources` or `no-budget` | "A$4.10 of A$20 this month." / "80% of this month's budget used." / "Budget reached: paid data paused until 1 Nov." | `costMeterView()` | `/settings` |

Each light has one of five tones. Tone is shown by shape and icon as well as colour, never colour alone:

| Tone | Meaning | Mark |
|---|---|---|
| `ok` | Fine | filled circle with a tick |
| `busy` | Working right now | filled circle with a slow "breathing" ring |
| `watch` | Worth a look, nothing is lost | triangle |
| `act` | Needs the owner | diamond with "!" |
| `off` | Switched off on purpose | hollow circle |
| `unknown` | Harbour can't tell | dashed circle with "?" |

### 4.4 (b) Needs you: what needs me now

At most 5 items, each one sentence and exactly one button. Built by `needsYou()` from these
candidates, in this priority order, then oldest first within a kind:

1. An `act` system light (the light's sentence; button "How to fix" to its link).
2. Pull requests waiting for the owner's OK (from the Board's `loadWorkStrip().needsYou`; button
   "Review").
3. New ideas to decide (suggested actions; button "Decide").
4. Content that needs the owner, then content ready to post (button "Open", to `/content` on the
   right tab).
5. Research targets waiting for approval (`approvalsWaiting()` per product; button "Review", to
   `/settings/products/<id>`).
6. An agent run that failed in the last 24 h and was not retried (button "See what happened").

Beyond 5, "N more" is a link only when every hidden item waits in one place (the Board's Needs
you for reviews and ideas, `/agents` for runs, `/content` for content); otherwise it stays plain
text rather than point at one of several pages.

Buttons are links to the page where the decision is made. The tower never changes data itself, so
nothing on it can be clicked by accident into a change. When nothing qualifies: "Nothing needs you
right now. Harbour will put anything that does here." with no button.

### 4.5 (c) Where the work is

The Board's `WorkStrip` (Board spec §4, "Today strip"), placed here unchanged: six column tiles with
counts and the flow bar, Stuck, Needs you and Moved today. The tower adds only a section heading and
anchor. Until the Board is merged the section is absent, not faked.

### 4.6 (d) Your products: one runway card each

Section lead: the existing briefing sentence and sub-line (`buildBriefing()`).
One card per configured product, in config order, in a responsive grid (1, 2 or 3 across). Each card:

1. **Name and verdict word**, with the product dot. The verdict is `verdictFor(averageScore(areas))`.
2. **Trend arrow** with words: "up 4 since last week", "steady", "down 3" (arrow plus text; never
   only an arrow). From the weekly score change (§4.8).
3. **The one next action**: the top active action for the product (`topActiveActions(db, [id], 1)`),
   as a link to its card.
4. **Last check**: "Checked 3 hours ago" with the freshness rule (§5).
5. **Highlights** (at most 3 short lines, skipped when there is no data, never shown as zero):
   - indexing: "In Google: 3 of 53 pages" (`indexingState()` over the latest scan's `scanFindings()`);
   - outside view: "ChatGPT and others named you in 1 of 5 answers" and "4 sites link to you"
     (`outsideView()`);
   - work in flight (after the Board): "2 in progress · 1 in review", with a mini flow bar.
6. **Content line** (only when content is on for the product): "2 drafts ready for you · 1 being
   written · 4 ideas waiting" (counts from one `scanContent()` per render).
7. **The main agent's touch**: "Claude last updated this product's cards 2 hours ago" (the newest
   `action_events` row by actor `claude` for the product). This is the visible trace of the main
   agent keeping status true. When there is none in 7 days: "Claude hasn't updated these cards this
   week."

The whole card is not a link (that would make one huge accessible name). Its heading links to
`/products/<id>`, and the next action and content line are their own links.

### 4.7 (e) What's happening

A calm feed for the last 24 hours, in two groups:

- **Running now**: queued and running jobs, each a sentence from `jobLabel()` ("Checking Acme Docs",
  "Claude is drafting a post for Acme Blog") with a `busy` light and "started 4 min ago".
- **Finished**: up to 5 items, **wins first** (a job that succeeded and produced something, a card
  moved to Done, a score rise), then ordinary finishes, then failures last, each with its plain
  sentence and a link to the run or card. "N more on the Agents page" beyond 5.

Sources: `jobs` finished since 24 h ago (bounded query, limit 50), `action_events` since 24 h ago
(bounded, limit 50), score rows of checks that finished in that window. Empty: "Nothing ran in the
last day. The next check is at 06:00." (next time from `scheduleRows()`.)

### 4.8 (f) Wins this week

"What got better since last <weekday>": at most 5 lines, plus one small graphic.

- Cards finished this week (count, and how many had a pull request merged).
- Score rises per product and area since 7 days ago, in verdict words: "Acme Docs: Found on Google
  went from Fair to Good." An area whose scoring formula changed in the window is skipped (the
  existing `formulaChangedArea()` rule in `lib/explain/scoring-notes.ts`).
- Pages newly in Google (indexing count now against 7 days ago, when both are known).
- Content pieces approved this week.
- The graphic: seven small bars, "cards finished each day", with the day names under them and a
  visually hidden table of the same numbers for screen readers.

A week with no wins says so kindly: "A quiet week so far. Small steps still count: the next one is
on the Board." Never a guilt line, never a streak.

### 4.9 The daily note

When the personality is warm, the existing note card sits in the right column beside (b) on wide
screens and directly after (b) on narrow ones. Its content and rules are unchanged (warm-friend
spec); only its place moves, because the first thing the owner reads is now "is everything OK".

## 5. Freshness rule

One pure function, `freshness(at, now, expectEveryMs)` in `lib/tower/freshness.ts`, decides how
every time on the tower is said and toned.

- **Phrase** (`lib/explain/tower.ts`, `agoPhrase`): "just now" (under 1 min), "N min ago" (under
  60 min), "N h ago" (under 24 h), "yesterday at 09:10", then "on 2 Oct". Times are in
  `HARBOUR_TIMEZONE` and formatted on the server, so there is no client clock and no hydration
  mismatch.
- **Tone**: `fresh` while age ≤ expected interval + grace; `late` up to twice that; `stale` beyond;
  `never` when there is no time at all.

| What | Expected every | Grace | Late → tone |
|---|---|---|---|
| Worker beat | 30 s | 90 s | `watch` up to 10 min, then `act` |
| Daily check | 24 h | 2 h | `watch`; `act` after 50 h |
| Backup | 24 h | 2 h | existing backup health decides |
| Daily note | 24 h | 1 h | the note card's existing gap line |
| Weekly runs | 7 d | 6 h | `watch` |
| Monthly refresh | 31 d | 1 d | `watch` |

A tile says "checked 3 min ago" when fresh, "last checked 2 days ago" with the `watch` tone when late
or stale, and "not checked yet" when never. The page's "updated HH:MM" is the render time.

## 6. Explaining in place

### 6.1 `<Term>`: a word with its meaning one step away

`components/explain/Term.tsx`, a small client component: `<Term id="indexed">in Google</Term>`.

- Renders the visible text with a dotted underline inside a `<button type="button">` whose accessible
  name is the visible text. The tip is an element with `role="tooltip"`, linked by
  `aria-describedby`, so a screen reader reads the word and then its meaning.
- **Hover**: shows after 300 ms, hides 150 ms after the pointer leaves the word and the tip (the tip
  itself is hoverable, so it never vanishes under the pointer). **Focus**: shows at once. **Tap or
  click, Enter or Space**: toggles and stays open. **Escape**: hides and keeps focus on the word.
  Clicking elsewhere hides it.
- The tip holds the glossary's one sentence and, when the glossary entry has one, a "More" link. It
  never holds a number, a status or anything the page needs to be understood.
- Positioned above the word, flipping below near the viewport top; never wider than 20 rem or the
  viewport minus 32 px. No library: CSS anchoring with a measured fallback.
- Light, dark and night via semantic tokens; visible focus ring; touch target at least 44 px tall
  through padding.

### 6.2 The glossary

`lib/explain/glossary.ts`: `GLOSSARY: Record<TermId, GlossaryEntry>`, where `TermId` is a string
union so a typo fails the type check. Each entry: `word`, `meaning` (one plain sentence, at most 160
characters), optional `more: { href; label }`. Fixed, reviewed text; no agent writes it.

The first entries: check, verdict, data source, indexed (in Google), sitemap, Search Console, outside
view, cited, links to you, worker, schedule, backup, Second Brain, agent, run, pull request, board
column, stuck, draft, voice profile, pillar, budget, paid data. Terms that are codes (SEO, GEO, AEO,
`HARBOUR_*`) are not glossary words: codes stay inside Technical details (plain-language spec).

A test keeps it honest: every entry is complete, plain (no codes, no setting names), one sentence,
within length, and every `TermId` is used somewhere or deleted.

### 6.3 "What's this page?" on every page

`components/explain/PageHelp.tsx`: a button at the right of every page header, opening a panel (a
disclosure, not a modal) with:

1. What this page is for (one sentence).
2. How to read it (at most 5 short lines, top to bottom).
3. What to do first (one sentence).
4. **Words on this page**: the page's terms with their meanings, read from the glossary. This is
   the place a term's meaning lives for anyone who never hovers.

Copy lives in `lib/explain/page-help.ts`, keyed by page: tower, actions, product, content, agents,
brain, settings, sources, devices, design. The panel's open state is not remembered (it should be
closed on the next visit). Keyboard: the `?` key opens it when focus is not in a text field; the
button names the shortcut in its `aria-keyshortcuts`.

## 7. Data

### 7.1 One new table: `worker_status`

There is no worker heartbeat while idle today, so "is the worker running" cannot be answered
honestly. Add a single-row table `worker_status (id integer primary key check (id = 1), beat_at,
started_at)`. The worker's loop calls `recordWorkerBeat(db, now)` at most once every 30 s
(`lib/ops/worker-beat.ts`); the web process only reads it through `workerLiveness(db, now)`, which
also counts a running job's `heartbeat_at`. Migration numbering: the Board adds 0014; whichever
branch merges second regenerates its migration number.

### 7.2 What each tile reads

All loaders live in `lib/tower/`, split as AGENTS.md asks: thin I/O readers (`*-data.ts`) and pure
shapers (tested with plain objects). Each tile's loader is wrapped by `loadTile()` so one failure
never breaks the page.

| Tile | Reader (I/O) | Shaper (pure) | Existing functions consumed |
|---|---|---|---|
| Headline | — | `towerHeadline(systems, needs)` | — |
| Systems | `systemFacts(db, config, now)` | `systemLights(facts, now)` | `workerLiveness`, `scheduleRows`, `productToday`, `backupStatus`, `brainSyncStatus`, `costMeterView`, `listJobs` |
| Needs you | `needsFacts(db, config, now)` | `needsYou(facts, lights, board)` | `actionCounts`, `approvalsWaiting`, `scanContent` |
| Work | Board's `loadWorkStrip` | — | — |
| Runways | `runwayFacts(db, config, product, now)` | `runwayCard(facts, now)` | `productToday`, `topActiveActions`, `scanState` + `scanFindings` + `indexingState`, `outsideView`, `scanContent`, `weeklyScoreChanges` |
| Activity | `activityFacts(db, now)` | `activityFeed(facts, now)` | `jobLabel`, `RUN_HEADLINE` |
| Wins | `winsFacts(db, config, now)` | `weekWins(facts, now)` | `weeklyScoreChanges`, `verdictFor`, `formulaChangedArea` |

`weeklyScoreChanges(db, productId, kind, now)` is new in `lib/scan/views.ts`: each area's latest score and
the latest score at or before 7 days ago, null where either is missing.

### 7.3 Bounds

Products are few (config); every other query has a limit (jobs 50, events 50, content uses the
existing 200 ideas / 600 pieces caps and a 15 s cache like `countReadyPieces`). The tower renders
on the server in one pass; target under 300 ms with four products on the owner's machine.

## 8. Empty and failure states

| Case | What the tile says |
|---|---|
| No checks yet | Runways show the clearly labelled sample, as Today does now; systems and needs-you are always real. |
| A loader throws | "Harbour couldn't read this just now. The rest of the page is fine, and it tries again at the next update." Technical details hold the error. Recorded with `console.error`, never turned into an empty success. |
| Worker beat never written | Worker light `unknown`: "Harbour hasn't heard from the worker yet. If you just started it, give it a minute." |
| Content off | The content line and content items are left out; nothing says "0 drafts". |
| Outside view not connected | The highlight line is left out; the product page explains why. |
| Nothing ran in 24 h | Feed says so and when the next run is. |

Every message says what happened, whether it matters and what to do (plain-language principle 4).

## 9. Auto-refresh

`components/tower/VisibleRefresh.tsx` (client) calls `router.refresh()`:

- every **60 s** while the tab is visible, or every **15 s** while a check or agent run is running
  (it replaces `RefreshWhileScanning` on this page);
- never while the tab is hidden; on becoming visible after more than 60 s, once at once;
- at most **120** refreshes per page load (about two hours at 60 s), then it stops and the header
  says "Updates paused. Reload to see the latest." with a Reload button;
- one timer per page, cleared on unmount, so there are no stacked pollers.

Refreshes keep client state (open disclosures, open tips), because `router.refresh` re-renders
server components in place.

## 10. Keyboard and screen readers

- One `h1` (the headline), one `h2` per section in reading order, each section a `<section
  aria-labelledby>`. The "On this page" list jumps to them.
- The headline's sub-sentence sits in a polite live region, so an auto-refresh that changes it
  ("1 thing needs you" → "Nothing needs you") is announced once; nothing else on the page is live.
- Status lights: each is a `<li>` with its label and tone in words ("Worker: needs you"); the mark is
  `aria-hidden`.
- Needs-you items are an ordered list; each button names its item ("Review: Add a sitemap for Acme
  Docs").
- The bar graphic has a hidden table; every arrow and light has words beside it.
- Full keyboard path: Tab reaches every link, button and term in reading order; no keyboard trap in
  tips or panels; visible focus everywhere.

## 11. Motion

- Status `busy`: a slow breathing ring (2.4 s, ease-in-out), only on running things.
- New since the last refresh (a feed item or a needs-you item under 5 minutes old): a soft tint that
  fades over 1.2 s, once. The item also says "new" in text.
- Cards and tiles appear without movement; numbers never count up; nothing bounces or shakes.
- Term tips fade in over `--duration-fast`.
- `prefers-reduced-motion: reduce` turns every animation and transition here off.
- The ocean wave background is owned by other work and is not changed here.

## 12. Mobile

- One column below 768 px, sections in the same order.
- Systems: the eight lights wrap into a 4 × 2 grid with labels; the sentence line stays.
- Runway cards stack; highlights stay (they are short).
- Activity and wins stack after the products.
- Touch targets at least 44 px; term tips open on tap and close on a second tap or outside tap.
- No horizontal page scroll at 320 px.

## 13. Light, dark and night

- Light and dark use the existing semantic tokens.
- **Night** is a new third theme for late hours: darker surfaces, warmer and dimmer ink, the tide
  accent softened, still WCAG AA for body text (proved by the existing contrast tests extended to
  night). `ThemePreference` gains `"night"`; the theme toggle cycles system → light → dark → night.
  No automatic switch by time of day in this version.
- Status tones map to semantic tokens (`--good`, `--accent`, `--warn`, `--bad`, `--ink-muted`), so
  every tone works in all three themes.

## 14. The main agent as boss

The tower makes the main agent's work visible; it does not add agent powers.

- The Board spec's rule stands: the main agent keeps each card's column true (CLI `pnpm actions
  move`).
- Each runway card shows when Claude last updated that product's cards (§4.6), and the activity feed
  shows Claude's card moves as they happen ("Claude moved 'Add a sitemap' to In review").
- AGENTS.md gains one line: after any hand-off or status change, the main agent checks the tower's
  runway card for that product reads true.

## 15. Non-goals

- No new agent, job kind or automatic action. The tower only reads.
- No change to scores, rules, collectors or the Board's behaviour.
- No inline mutations on the tower: every decision happens on its own page.
- No live push (websockets or server-sent events): bounded refresh is enough for one owner.
- No charting library: two tiny SVGs, hand-made.
- No streaks, no scores for the owner, no badges that punish absence.
- The ocean wave background, the Board, plain-language fixes, reliability hardening and the Postiz
  button are built elsewhere.

## 16. Decisions

1. The home stays at `/` named **Today**; "Tower" is internal only.
2. The h1 becomes the tower headline; the briefing moves to lead "Your products" with its words
   unchanged.
3. The daily note moves beside "Needs you"; its content and rules are unchanged.
4. One new single-row table (`worker_status`) for worker liveness; nothing else changes in the schema.
5. Needs-you buttons are links, never mutations.
6. One refresher per page: 60 s visible, 15 s while work runs, 120 refreshes per load.
7. Term tips are explanations only; every term's meaning also appears in "What's this page?".
8. Night is a chosen theme, not automatic.
9. Wins compare against 7 days ago, skipping areas whose formula changed.
10. Lists cap at 5 everywhere on the tower.

## 17. Later

- A "status sweep" record the main agent writes after reviewing every project, shown as "Claude
  confirmed all products at 09:00".
- A dedicated glossary page if the owner wants to browse terms.
- Automatic night theme after a chosen hour.

## 18. As built

Built on branch `feat/control-tower` in nine tasks (plan `2026-10-04-control-tower.md`); the
Board was merged in first. Where it differs from the sections above:

- **Glossary and tips (§6.1, §6.2).** 23 plain terms; codes (SEO, GEO, AEO, `HARBOUR_*`) are
  forbidden in it by test, as §6.2 says. A test checks every `<Term id>` in `app/` and
  `components/` resolves and every term is listed on at least one page's help. The tip is always
  in the DOM (hidden when closed), has a 44 px hit area through `::before`, and wraps left-aligned.
- **Page help (§6.3).** Every page uses `PageHeader` (h1, intro, What's this page?). It takes
  `titleId` (Actions keeps its focus-target h1) and `titleLevel` (examples on `/design`). Only the
  first `PageHelp` on a page answers `?`.
- **Worker heartbeat (§7.1).** Migration `0015_worker_status`. The worker beats at most every
  30 s on a timer and on every loop pass, so a long job keeps it alive; nothing wrote
  `jobs.heartbeat_at`, so a running job counts by `heartbeat_at ?? started_at`. A failed beat is
  logged once and never stops the worker.
- **Readers (§7.2).** `needsFacts` and `winsFacts` take the render's one content read (a 15 s
  cached `towerContentScan`), shared through a memo that also remembers a throw, so each tile that
  uses content fails honestly. Runway content is read only for products with content on. Wording
  is split by tile (`lib/explain/tower*.ts`, `spend.ts`); the cost meter reuses the spend
  sentences.
- **Headline (§4.2).** Only an `act` light is passed as the leader. Watch or unknown lights give
  "Nothing is broken. N lights are worth a look."; unread tiles are said ("Harbour couldn't read
  its systems just now."). The h1 holds lead and sub-line; only the sub-line is the polite live
  region, so the minute-by-minute "updated" time is never announced.
- **Systems (§4.3).** "All eight are fine." only when every light is `ok`; busy or off with
  nothing needing a look reads "Nothing needs a look. Working now: … Switched off: …". The lights
  are one client disclosure row (one panel, one light open at a time; Escape closes and refocuses
  the light unless a tip is open), a 4 x 2 grid below the wide layout and one row of eight from
  1024 px.
- **Needs you (§4.4).** "N more" is a link only when every hidden item waits in one place.
  Items carry no "new" tint: `NeedItem` has no age flag yet.
- **Runway cards (§4.6).** Highlights are `<Term>`s. A gap's reason is left out when the check
  line already says the same words ("Not checked yet." once). Before the first check the cards
  show the sample verdicts under the sample banner while "checked" stays real.
- **Work strip (§4.5).** Inserted unchanged in `#tower-work`; if it can't be read a "Where the
  work is" section says so, so there are always six h2s. On a phone the flow bar's segments wrap
  instead of clipping; Stuck and Needs you keep their own height.
- **Motion (§11).** Breathing ring 2.4 s and new-item tint 1.2 s, both tokens
  (`--duration-breathe`, `--duration-settle`), both off under reduced motion.
- **Night (§13).** New primitives for night; contrast tests cover ink, muted ink, accent and the
  three tones on every surface, and the ocean, in night as in light and dark.
- **Auto-refresh (§9).** `VisibleRefresh` + `useVisibleRefresh` as specified; the paused line is
  its own `UpdatesPaused` component so `/design` can show it without a timer.
- **Deleted** (replaced by the tower): `TodayView`, `TodayHeader`, `ScoresSection`, `ScoreTable`
  and their tests. Product pages keep `RefreshWhileScanning`.
- **Tests.** Unit and component tests per tile and loader; `tests/e2e/tower.spec.ts` runs last on
  system Chrome and covers the headline and six sections, eight lights in words, Needs you links
  that open real pages, tips on hover, focus and tap, page help, no refresh while hidden (fake
  clock), phone widths 390 and 320 with nothing sideways or clipped, reduced motion, the keyboard
  path in reading order with visible focus, night, and one tile failing alone (the spec renames
  the worker table for one render, so the real reader throws inside the real loader). There is no
  axe check: it would be a new dependency, and contrast is proved by the token tests instead.
- **Not built yet:** the "new" tint on Needs-you items; one shared `productToday` read per render
  (it is read three times; bounded by the product count); the daily note is not behind `loadTile`
  (it already catches an unreadable folder, but a database error there would still fail the page).
