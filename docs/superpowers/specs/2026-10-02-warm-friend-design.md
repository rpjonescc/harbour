# Harbour as a warm friend — design

Status: design approved by the owner in conversation 2026-10-02. First version ("fixed,
hand-written lines") was **replaced the same day** at the owner's request: the owner does not
want deterministic lines or greetings. They want Harbour's AI agent to have a fun but
experienced personality, to surprise them, and to wake them up inspired to work through the
tasks that are left. The owner chose "a warm friend, in the background" (no character or
invented name) and an optional private `ownerName`.
Builds on: `2026-10-02-plain-language-ux-design.md` (plain-language voice, verdict bands,
Today's briefing). Amends: that spec's "no AI-generated explanations" non-goal, **for this
feature only** (the daily note); every explanation and message elsewhere stays fixed text.

## 1. Intent

Opening Harbour should feel like a good friend who is on the owner's side, every time, good
news or bad. The friend is **an AI agent with a personality**: a seasoned, warm, quick-witted
mentor who has seen a lot of projects. Wins are celebrated, bad news is honest and kind with a
next step, and out of hours it says what can wait. Because an agent writes it fresh, the owner
never knows what it will say.

**Success:** the owner opens Today, enjoys the note, and feels both informed and keen to work
through what's left. They never feel nagged, guilty or alarmed.

**Non-goals:**
- No mascot, avatar or invented name (the owner chose "in the background").
- No streaks, counters or anything that punishes absence.
- No change to what Harbour measures or stores about the sites.
- The agent never changes the board, the sites or the config; it only writes the note.

## 2. Principles

1. **Honest first, kind always.** The facts come from Harbour's own data; the agent only frames
   them. A weak score is never described as good, and no figure is invented.
2. **Bad news carries a next step.** A note that names a problem also says what to do about it.
3. **Never pressure.** No guilt, no alarm. When something is broken the note still says what can
   wait.
4. **Fun but experienced.** Dry wit, perspective, the odd harbour or sea turn of phrase in
   moderation. Never childish, never cringey, never relentless cheerfulness.
5. **Safe by construction.** Agent output is untrusted: it is validated against a schema, checked
   for invented figures and banned content, sanitised, and replaced by a plain fallback if it
   fails. A missing note is shown as a quiet gap, never as fake content.
6. **Quiet is a first-class choice.** The owner can switch the personality off entirely.
7. **Accessible and respectful of motion.** Meaning is in words; motion respects
   `prefers-reduced-motion`.

## 3. The daily note

### 3.1 What it is

A short note written by the agent each morning, shown at the top of Today:
- `greeting`: one line, time-aware ("Morning" and so on), using the owner's name if configured.
- `headline`: one sentence setting the mood of the day.
- `body`: two or three sentences (at most about 330 characters in total) in the agent's voice,
  covering how things stand, what's worth celebrating, and what's left to do, ending on
  something that makes the owner want to start.
- `picks`: up to three short strings naming the actions worth doing today, each copied from the
  board's own action titles (the agent chooses, it does not invent).
- `rest`: an optional single sentence, present only when the owner's local time or the day of
  the week suggests rest, saying what can wait.
- `mood`: `celebrate`, `steady` or `attention`, used only to tint the wave.

### 3.2 When it is written

- By the worker, daily at a configurable local time (default 06:30 in `HARBOUR_TIMEZONE`), so the
  note is ready when the owner wakes. A "Write me a fresh one" button on Today queues an
  on-demand run, rate-limited (at most one run at a time, and at most a handful per day).
- The note is written once per day plus on demand. Today shows the newest valid note from the
  last 24 hours; older than that it shows the quiet gap ("No note yet today").
- It reuses the existing agent runner and job queue, the same way the weekly analyst runs: one
  job kind, bounded by its own time, size and rate caps. It is not counted in the cost ledger
  (see §10(a)); each run is in the Agents run history like any other agent run.

### 3.3 What the agent is given

A small facts snapshot built by Harbour (no secrets, no file contents, no personal data beyond
the optional first name):
- local time, day of week, whether it is out of hours or a weekend;
- each product's area verdicts, scores and changes since the last check;
- the active actions: id, plain title, impact, effort, who is on it;
- wins in the last 24 hours (finished actions, score rises);
- trouble: failed data sources, a failed or stale backup, a failed last check;
- the last few notes' headlines, so the agent avoids repeating itself.

The persona and rules live in a version-controlled prompt file in the repo (fictional examples
only, no personal data), covering the voice (§2.4), the honesty rule, the rest rule, the output
schema and the banned content. Changing the personality is editing that file.

### 3.4 Validation and fallback (the worker, before anything is shown)

The agent's output is parsed with zod and rejected unless:
- it matches the schema, with every string within its length cap;
- it is plain text only: no markdown, HTML, links, code or control characters;
- every number in the text appears in the facts snapshot (so no invented figures), and every
  area or product it names is in the snapshot (known limit: a single invented name used only as a
  sentence's first word cannot be told from an ordinary capitalised word);
- every pick exactly matches a current active action title;
- it contains no exclamation-mark runs, no ALL CAPS shouting, and none of a banned list
  (hurry, urgent, behind, overdue, falling behind, failing, must, should have);
- if the facts include trouble, the body names a next step (checked by requiring a pick or an
  explicit phrase from a short allowlist), and if the facts include none, the note does not
  claim trouble.

A rejected note is retried once with the reason fed back; a second failure is recorded as a
failed run with the reason, and Today shows the quiet gap (the fallback is the briefing already on
the page: see §10(c)). Nothing rejected is ever shown.

### 3.5 Storage

Valid notes are written as markdown files with frontmatter into the brain directory
(`HARBOUR_BRAIN_DIR`), under `notes/daily/YYYY-MM-DD-HHmm.md`, through the existing brain git
path, like every other agent output. The web process only reads them. Pruning old notes
is not built (see §10(b)). No new database tables (the
existing `jobs` table gains one nullable `result` column).

Integrity: the agent can write anywhere in the brain, so a file there proves nothing. The agent
writes a draft, the worker publishes it only after the checker accepts it, and on success the
daily-note job stores the sha256 of the published bytes in `jobs.result`. The web process shows a
note only while a succeeded job for its stamp holds the hash of the file's current bytes: a file
edited after it was checked, or never checked, is not shown.

## 4. The Today note card

- A card above the briefing: greeting, headline, body, the `rest` sentence when present, the
  picks as a short list that links to the Actions board, and a quiet "Write me a fresh one"
  button. The briefing stays the page's `h1`; the note adds no heading above it.
- A `celebrate` mood gives the wave one soft ripple (§5); reduced motion shows only the text.
- The text is rendered as plain text (never markdown or HTML).
- Hidden when the personality is `quiet`. When no valid note exists: one calm line
  ("No note yet today. The next one is written at 06:30.") and the button.
- The sample Today shows a fixed, clearly labelled sample note, never agent output.

## 5. The wave

A decorative, semi-transparent set of two or three slowly drifting wave layers along the lower
half of the viewport, behind all content, in the signed-in shell.

- Plain CSS and inline SVG: no dependencies, no scripts, no canvas.
- `pointer-events: none`, `aria-hidden="true"`, fixed position, below content.
- Colour from the semantic tokens only (the "tide" accent), low opacity, in light and dark.
  Text contrast is unaffected and verified against WCAG AA in both themes.
- Motion: slow drift at different speeds; static under `prefers-reduced-motion: reduce`;
  paused when the document is hidden.
- Mood: `celebrate` adds one soft ripple on load (not a loop). The wave never turns red or
  alarming.
- Hidden when the personality is `quiet`. Shown on `/design` as an example.

## 6. Settings and config

- `HARBOUR_PERSONALITY=warm|quiet`, default `warm`; validated with zod at startup (an invalid
  value is an error naming the setting). `quiet` turns off the daily note job, the note card and
  the wave. Documented in `README.md` and `.env.example`; shown read-only in Settings.
- `HARBOUR_NOTE_TIME` (HH:MM in `HARBOUR_TIMEZONE`, default `06:30`), validated the same way.
- `ownerName` in `harbour.config.json` (gitignored): optional, trimmed, at most 40 characters,
  validated with zod, never logged, and sent to the agent only as a first name for the
  greeting. `harbour.config.example.json` shows a fictional value.
- The note job is bounded by its own caps rather than the agent budget and cost caps (see
  §10(a)) and appears in the Agents page
  run history like other jobs.

## 7. Architecture and boundaries (AGENTS.md)

- The web process never runs an agent. The "fresh note" button only enqueues a job; the worker
  runs it.
- The agent writes only inside the brain directory and only proposes: it cannot touch the board,
  the sites or the config. The note is data the web process reads.
- `lib/explain/voice/` holds the pure parts: the facts-snapshot builder, the validator, the
  fallback line and the day-part helpers. No I/O, import rules as `lib/explain`.
- Collectors are unchanged. The agent prompt and persona file sit with the other prompts.
- Agent output and the facts it is given are treated as untrusted data in both directions (the
  facts snapshot contains product and action titles that originate from crawled pages and the
  analyst, so they are fenced and labelled as data in the prompt).

## 8. Testing

- Validator: every rejection rule with a failing and a passing case (schema, caps, markup,
  invented numbers, unknown area, picks not on the board, banned words, shouting, trouble
  without a next step, claiming trouble when there is none).
- Facts snapshot: built from fixtures; contains no secrets or paths; caps respected.
- Job: with a recorded fixture of the agent's output (no real agent calls in tests): valid note
  is written to the brain path; invalid note is retried once then recorded as a failure with the
  fallback shown; rate limit and schedule behaviour; no cost-ledger row is written.
- Components: the note card renders each field as plain text; hidden under `quiet`; the gap state;
  the wave is `aria-hidden`, has no pointer events, and renders nothing under `quiet`.
- E2E: Today shows the note card (from a seeded valid note) and the briefing is still the `h1`;
  the plain-language smoke check passes; the wave doesn't intercept clicks; reduced motion is
  honoured (emulated).
- Computed-contrast check for body text over the wave in both themes.
- The persona prompt is covered by a test that the rendered prompt contains the persona, the
  rules and the fenced facts, and nothing from the environment.

## 9. Order of work

1. Config: `HARBOUR_PERSONALITY`, `HARBOUR_NOTE_TIME`, `ownerName` (tests, README, `.env.example`).
2. The pure parts: facts snapshot, validator, fallback and tone tests.
3. The agent job: persona prompt, runner wiring, schedule, on-demand enqueue with rate limit,
   brain write, cost accounting.
4. The Today note card and its data reading.
5. The wave and its `/design` example.
6. README, spec notes and full verification.

## 10. As built

Where the build differs from this spec or fills a gap, and why.

- **(a) The cost ledger is not used.** It records paid API calls only, and the note runs on the
  owner's Claude subscription like every other agent, so nothing is metered there. The note is
  bounded by its own caps (one run at a time, five minutes an attempt, one retry, at most 5
  on-demand requests a local day, a facts snapshot and a note file of bounded size) and shows in
  the Agents run history with its prompt version.
- **(b) Pruning old notes is not built.** Notes stay in the brain (about 400 small files a year);
  readers look at only the newest 30.
- **(c) The fallback line is the briefing already on the page.** Today never shows a made-up
  substitute. `lib/explain/voice/fallback.ts` holds the quiet gap line, the card's state
  messages and the fixed sample note for the sample Today.
- **(d) `HARBOUR_SCHEDULED_NOTE` was added.** Every schedule has an off switch of this form, and
  the end-to-end suite needs one so a scheduled run does not queue ahead of the runs under test.
- **(e) "Out of hours" is 20:00 to 04:59 local time, and a weekend is all day Saturday and
  Sunday** (the weekend wins). The default 06:30 note is therefore a working-morning slot.
- **(f) The body cap is 360 characters hard, 330 asked of the agent,** so a few over never costs
  a retry.
- **(g) The checker has extra rules beyond the spec:** the area codes (SEO, GEO, AEO) are
  rejected, a note may celebrate only when the facts list wins, scores that are not strong are
  not praised, number words and vague quantities ("doubled", "dozens") are treated like figures,
  hidden or look-alike characters are refused, and a pick must not repeat. Unknown names are found
  by capitalised words that are not in the facts (product names and the first name count as whole
  phrases; a short allowlist covers everyday proper nouns). Known limits: a single invented name
  used only as the first word of a sentence can pass, a figure is checked against the whole set of
  figures so it can sit in the wrong place when it exists elsewhere in the facts, and an invented
  name in lowercase can pass. Statements made only of known words are not verified ("Google
  changed its ranking rules overnight, which explains the dip" passes): the persona forbids
  stating a cause or an outside event (rule 9), but the checker cannot enforce it.
- **(h) The one retry runs inside the same job,** with the checker's reason fed back and only the
  time the first attempt left. A rejected draft is deleted before the retry, because Claude
  Code's `Write` will not overwrite a file it has not read.
- **(i) The wave is filled with `--accent-soft`,** not `--accent`: that token is a pale tint in
  light and a deep one in dark, so three faint layers stacked on one pixel keep every text colour
  at WCAG AA, which `design/wave-contrast.test.ts` proves in light, dark and system dark. The
  layers (opacity, speed, shape) are defined once in `design/wave.ts`.
- **(j) The ripple is one CSS rule keyed on `data-mood="celebrate"`** on the note card, which
  moves the front layer once; reduced motion switches it off with the drift.
- **(k) The hidden-tab pause is the browser's:** no script watches visibility; browsers do not
  animate a hidden tab.
- **(l) The note agent has the `Write` tool only.** No Read and no web: the facts hold titles from
  crawled pages, so a web tool would be a way out. It writes a draft that Harbour checks, then
  moves into `notes/daily/`. Today shows a note only when a succeeded `daily-note` job vouches for
  its stamp and the file's content hash equals the one the checker accepted, so a file added,
  edited or overwritten afterwards (by any agent) is never shown.
- **(m) The card knows how the newest run ended.** The note slot carries the newest `daily-note`
  job's id and status, so "Write me a fresh one" stops waiting when its own run ends: a rejected
  or failed run is said calmly ("That note didn't pass Harbour's checks, so nothing was shown. You
  can try again."), and a note re-written in the same minute (same stamp) still ends the wait. The
  card only promises "the next one is written at HH:MM" when the schedule is on and a token is
  set. A catch-up note is stamped with the minute it is written, so "Written …" is true.
