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
  job kind, bounded by its own time, size and rate caps (the cost ledger records paid API calls only; no agent run is metered there)
  any other agent run.

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
  area or product it names is in the snapshot;
- every pick exactly matches a current active action title;
- it contains no exclamation-mark runs, no ALL CAPS shouting, and none of a banned list
  (hurry, urgent, behind, overdue, falling behind, failing, must, should have);
- if the facts include trouble, the body names a next step (checked by requiring a pick or an
  explicit phrase from a short allowlist), and if the facts include none, the note does not
  claim trouble.

A rejected note is retried once with the reason fed back; a second failure is recorded as a
failed run with the reason, and Today shows the quiet gap plus a plain, fixed fallback line built
from the facts by the plain-language library (the briefing already on the page). Nothing
rejected is ever shown.

### 3.5 Storage

Valid notes are written as markdown files with frontmatter into the brain directory
(`HARBOUR_BRAIN_DIR`), under `notes/daily/YYYY-MM-DD-HHmm.md`, through the existing brain git
path, like every other agent output. The web process only reads them. Notes older than the
retention window are pruned with the other agent artefacts. No new database tables.

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
- The note job obeys the existing agent budget and cost caps and appears in the Agents page
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
