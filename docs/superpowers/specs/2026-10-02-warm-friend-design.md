# Harbour as a warm friend — design

Status: design approved by the owner in conversation 2026-10-02 ("a warm friend, in the
background"; greet by name via an optional private config value). The owner chose to go
straight from this spec to the plan and the build.
Builds on: `2026-10-02-plain-language-ux-design.md` (the plain-language voice, the verdict
bands and Today's briefing). Amends: the README (settings) and `.env.example`.

## 1. Intent

Opening Harbour should feel like a good friend who is on the owner's side, every time, good
news or bad. Wins are celebrated. Bad news is honest and kind, always with a next step,
because anything that isn't working can be improved. Harbour also supports a healthy
work-life balance: out of hours it says what can wait.

**Success:** the owner opens Today and, in one glance, feels both informed and looked after.
They never feel nagged, guilty or alarmed.

**Non-goals:**
- No character, mascot or invented name for Harbour (the owner chose "in the background").
- No AI-generated wording: every line is fixed, hand-written and reviewed.
- No streaks, counters or anything that punishes absence.
- No change to what Harbour measures or stores.

## 2. Principles

1. **Honest first, kind always.** The facts come from the plain-language library; the personality
   only frames them. A weak score is never described as good.
2. **Bad news always carries a next step.** A "needs a look" line must name what is wrong in
   plain words and point to the next action.
3. **Never pressure.** No urgency language unless something is genuinely broken, and even then
   the line says what can wait.
4. **Calm over clever.** Warm, a little playful, never childish, never exclamation-heavy.
5. **Quiet is a first-class choice.** The owner can switch the personality off entirely.
6. **Everything is accessible and optional to perceive.** Meaning is in words; motion respects
   `prefers-reduced-motion`; nothing is announced aggressively to screen readers.

## 3. The voice library: `lib/explain/voice/`

Pure data plus pure functions, no I/O, following the `lib/explain` import rules (values from
`lib/explain/**` only; everything else `import type`).

### 3.1 Inputs (`VoiceInput`)

- `now`: the current instant, and `timeZone` (HARBOUR_TIMEZONE), from which the pure helpers
  derive the day part and the weekday.
- `ownerName`: optional string, or null.
- `health`: the briefing's overall verdict band (Strong, Good, Fair, Needs work) or null when
  there are no scores yet.
- `wins`: the notable good changes: an area score up by at least 3 since the last check; actions
  finished in the last 24 hours (count).
- `trouble`: whether any data source failed, the backup failed or is stale, or the last check
  failed (reuse the briefing's own trouble rules rather than duplicating them).
- `weakest`: the weakest area with a score, if any, and whether an active action exists for it
  (to name the next step).

### 3.2 Mood

`moodOf(input)` returns one of:
- `celebrate`: at least one win and no trouble.
- `attention`: any trouble, or health is Needs work.
- `steady`: everything else (including no scores yet: a gentle "getting set up" variant).

Trouble outranks a win: when both are present the mood is `attention`, and the line may
acknowledge the win in its second sentence.

### 3.3 Day part

`dayPartOf(now, timeZone)` returns `morning` (05:00–11:59), `afternoon` (12:00–17:59),
`evening` (18:00–21:59) or `night` (22:00–04:59), plus a `weekend` flag (Saturday and Sunday in
the owner's time zone).

### 3.4 Lines

For each mood there is a fixed set of at least five hand-written lines, each with a headline
and one supporting sentence (at most about 110 characters each, per the plain-language design
direction). The pick is `set[daySeed % set.length]` where `daySeed` is the local calendar day
number, so the line is stable within a day and varies across days.

- Greeting: `Good morning` / `Good afternoon` / `Good evening` / `Still up?` for night, with
  `, {name}` appended when a name is set. The weekend adds a quiet note rather than a different
  greeting.
- **Balance note**, shown when the day part is `evening` or `night`, or the day is a weekend:
  - if mood is not `attention`: "Nothing here needs you tonight. It'll keep till morning."
    (and a weekend variant);
  - if mood is `attention`: "One thing is worth a look. Everything else can wait."
- `attention` lines always include the next step, built from `weakest` and the top action's
  plain title when one exists ("The first step is waiting under Worth doing next."), and
  otherwise a generic "Let's look at it together below."
- Celebration lines name the win with the plain area name and the change ("Found on Google is up
  4. Nice work.") or the finished-action count.

`voiceFor(input)` returns `{ mood, greeting, headline, support, balance }`.

### 3.5 Tone rules (enforced by tests)

- No exclamation marks, no ALL CAPS, no more than one emoji-free sentence in `support`.
- No words from a banned list (hurry, urgent, behind, overdue, failing, falling behind, must,
  should have).
- Every `attention` line contains a next-step phrase.
- Every line is within the length cap.
- Wording is Australian English.

## 4. The Today greeting

- A small greeting block above the briefing: the greeting line, then the headline and support
  sentence, then the balance note when present. The briefing remains the page's `h1` and main
  headline; the greeting is supporting text and must not add a heading level above it.
- When `mood` is `celebrate`, a quiet "Nice work" chip appears beside the headline and the
  wave gives one soft ripple (see §5). With reduced motion, only the chip appears.
- The block is hidden when the personality is `quiet`.
- On the sample Today the greeting uses sample inputs and says nothing about real data.

## 5. The wave

A decorative, semi-transparent set of two or three slowly drifting wave layers along the lower
half of the viewport, behind all content, in the signed-in shell.

- Plain CSS and inline SVG: no dependencies, no scripts, no canvas.
- `pointer-events: none`, `aria-hidden="true"`, fixed positioning, below content in the stacking
  order.
- Colour from the semantic tokens only (the "tide" accent), low opacity, working in light and
  dark. Text contrast is unaffected: layers stay faint enough that WCAG AA text contrast holds
  against the page background; this is verified for both themes.
- Motion: the layers drift at different, slow speeds. Under `prefers-reduced-motion: reduce`
  the layers are static. Animation also pauses when the document is hidden.
- Mood: `attention` and `steady` use the base speed; `celebrate` adds one soft ripple on load
  (not a loop). The wave never turns red or alarming.
- Hidden when the personality is `quiet`.
- The wave also appears on `/design` as an example, with a note on how it reacts to
  reduced motion.

## 6. Settings and config

- `HARBOUR_PERSONALITY=warm|quiet`, default `warm`. Validated in `lib/config.ts` with zod;
  an invalid value is a startup error naming the setting, never a silent default. Documented in
  `README.md` and `.env.example`; shown read-only in Settings ("Personality: Warm").
- `ownerName` in `harbour.config.json` (gitignored, so the owner's name never enters the public
  repo): optional string, trimmed, at most 40 characters, validated with zod. Never logged.
  `harbour.config.example.json` shows a fictional value.

## 7. Architecture and boundaries

- `lib/explain/voice/` is pure and tested on its own. It reads no database and no config.
- A thin server-side function (in `lib/today/`) assembles `VoiceInput` from data Today already
  loads (the briefing's trouble flag, scores and deltas, recent done actions) and calls
  `voiceFor`. No new database tables and no new collectors.
- Components: `components/today/Greeting.tsx` (server component), and
  `components/shell/Wave.tsx` (server component, markup and CSS only). The wave's styles live
  with the design tokens' stylesheet pattern already used by the shell and respect the size
  limits.
- The web process stays read-only for this feature: it never writes anything new.

## 8. Testing

- Voice rules: every mood, every day part, weekend vs weekday, name vs no name, trouble beats a
  win, no-scores case, determinism (same input, same output; different days rotate).
- Tone tests from §3.5 run over every line in every set.
- Components: Greeting renders the right blocks per mood and hides under `quiet`; the wave is
  `aria-hidden`, has no pointer events, and renders nothing under `quiet`.
- E2E: Today shows a greeting and the briefing is still the `h1`; the plain-language smoke check
  still passes; the wave does not intercept clicks; reduced motion is honoured (emulated).
- A computed-contrast check for body text over the wave in light and dark.

## 9. Order of work

1. Config: `HARBOUR_PERSONALITY` and `ownerName` (with tests, README, `.env.example`).
2. The voice library and its tone tests.
3. The Today greeting and its data assembly.
4. The wave and its `/design` example.
5. README, spec notes and full verification.
