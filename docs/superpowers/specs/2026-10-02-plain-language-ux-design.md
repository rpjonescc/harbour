# Plain-language UX — design

Status: approved in conversation 2026-10-02; written spec awaiting owner review.
Amends: `2026-10-01-harbour-design.md` §8 (Actions), §9 (UI surfaces) and the AEO formula (§5).

## 1. Intent

The owner is new to SEO and GEO. Harbour must be **calm and easy to understand** without being
childish, and keep the power of a high-quality dashboard. For anything on screen the owner should
be able to tell, at a glance:

- **what it is**
- **why it is there**
- **what to do about it**
- **why that is valuable**

**Success:** the owner can open any screen cold and explain to someone else what it says and
what they would do next ("ah yep, that makes total sense").

**Non-goals:**
- No change to what Harbour measures or stores.
- No AI-generated explanations: the explanations are fixed, reviewed text.
- The Second Brain viewer is unchanged.

## 2. Principles

1. **Meaning first, numbers second.** Lead with a verdict or a plain sentence, and keep the
   number small beside it for tracking.
2. **One sentence always visible, more on request.** Every score, section and status has a
   one-line plain explanation. "What's this?" opens the full four parts: what it is, why Harbour
   checks it, what to do, why it's worth it.
3. **Technical detail is never removed, only tucked away.** Raw evidence, sub-score keys, codes
   and formulas live behind a "Technical details" disclosure, closed by default.
4. **Every message answers "what happened, does it matter, what do I do".** No bare "failed",
   no environment-variable names as the message (they may appear inside Technical details or
   setup steps).
5. **Calm density.** Fewer, larger, well-spaced items, with full tables one click away. No
   colour as the only signal.

## 3. Vocabulary

### Area names

| Code | Plain name | One-line meaning |
|---|---|---|
| SEO | **Found on Google** | Google can find, read and rank your pages. |
| GEO | **Recommended by AI assistants** | ChatGPT, Perplexity, Gemini and Claude can reach your site, know who you are, and cite you. |
| AEO | **Answer-ready** | Your pages give short, direct answers that Google and AI assistants can quote. |

Codes appear only in Technical details and in the Second Brain research.

### Verdict bands

Bands apply per area and per sub-score, on 0–100.

| Score | Verdict |
|---|---|
| ≥ 85 | Strong |
| 70–84 | Good |
| 50–69 | Fair |
| < 50 | Needs work |

When data is missing, the verdict line says so ("speed data still arriving", "not connected
yet") instead of implying a worse score. Missing data is a gap, never a zero (AGENTS.md).

### Wording changes

| Today | Becomes |
|---|---|
| collectors | data sources |
| paid sources | paid data |
| impact high/medium/low | Big win / Worth doing / Small win |
| effort small/medium/large | quick job / an afternoon / a project |

**Action columns:**

| Status | Column |
|---|---|
| suggested | New ideas |
| open | To do |
| in_progress | In progress |
| done | Done |
| snoozed | Snoozed |
| dismissed | Dismissed |

Status values in the data model are unchanged.

The owner-facing word for a visibility check is **check** (button: Check now); command names, API
routes and settings keep *scan*.

**Who's on it** (derived from the status, the PR link and who made the latest *status-changing*
event — its creation counts; a PR-link event, which keeps the status, does not):
- "New idea, not decided yet": the action is suggested.
- "Pull request waiting for your OK": it is in progress and has a PR link (whoever started it).
- "Claude is on it": it is in progress, with no PR link, and Claude moved it there.
- "Waiting for you": it is open, or in progress and moved there by anyone else (or by someone
  Harbour no longer knows, after old history was pruned).
- Done, snoozed and dismissed actions show no "who's on it".

## 4. Architecture

### 4.1 Explanations library: `lib/explain/`

This is pure data plus pure functions, with no I/O.

- `areas.ts`: each area's plain name, one-liner and four-part explainer.
- `subscores.ts`: one entry per sub-score key in the current formula, holding the plain name,
  a one-liner template that takes the measured evidence numbers, and the four-part explainer.
- `sources.ts`: one entry per data source, holding the plain name, what it gives Harbour, how
  to connect it, and its status phrases (connected / not connected / failed / waiting).
- `verdict.ts`: `verdictFor(score: number | null, missingReason?: string)` returns
  `{ label, tone, sentence }`.
- `actions.ts`: plain phrases for impact, effort, status columns and "who's on it".
- `briefing.ts`: builds Today's one-sentence briefing and its sub-line deterministically from
  the scores, open actions and source health (see §5.1).

The weekly analyst prompt gets the area names and verdict bands, so its write-ups use the same
words.

### 4.2 Shared components: `components/explain/`

Each component works in light and dark, uses semantic tokens only, is fully keyboard-accessible,
and appears on `/design`.

- `<VerdictLine>`: area name, verdict word (tone colour plus text), small number, and trend
  phrase ("up 2 since the last check", "steady"; the stored change is against the previous check).
- `<Explainer>`: the visible one-liner, plus a "What's this?" disclosure button
  (`aria-expanded`, one owner per label) revealing the four parts and an optional "Next step"
  link to the matching action.
- `<TechnicalDetails>`: a native `<details>` element, closed by default. It remembers the
  owner's choice per section in localStorage, wrapped in try/catch, and is never required.
- `<EmptyState>`: says what will appear here, when, and why.

## 5. Screens

### 5.1 Today

1. Date and "last checked …".
2. **Briefing sentence:** overall health plus the single biggest opportunity, chosen by rule.
   Health is the verdict band of the rounded mean of every area score there is ("Your sites are
   in fair shape." / "Your sites need some work."; "Your site …" with one product; "Harbour has
   no scores yet, so there's no verdict." with none). The opportunity is the lowest-scoring area
   (with a score) across products that has an active (open or in-progress) action — ties go to
   the earlier product, then Found on Google → Recommended by AI assistants → Answer-ready —
   written "Biggest opportunity: Answer-ready for Acme Docs (needs work)." and left out when
   none qualifies. Under it, a sub-line: "N things worth doing · Claude is handling M · nothing
   is broken" (M only when Claude is on something). "Nothing is broken" appears only when
   nothing is; otherwise the sub-line names each problem in its place, in this order: a check
   that failed outright with no failing source listed ("the last check for Acme Docs didn't
   finish"), the failing data source (or "2 data sources had a problem in the last check"), and
   a backup that needs a look ("the last backup didn't finish", "no backup in the last 2 days",
   "Harbour can't open the backup folder", the same words as the backup notice).
3. **Product table:** one row per product, one column per area, showing `<VerdictLine>` in
   compact form.
4. **Next up:** the top 3 actions as plain cards. Each card has a title, a one-line
   reason, a tag (area plus effort phrase) and who's on it. As built: the heading is Next up, so a
   "Worth doing" card (medium impact, §3) doesn't sit under a "Worth doing next" heading.
5. **Calm notices:** backup, source health and cost, each written per principle 4.

### 5.2 Product page

- Opens with three area cards (`<VerdictLine>` plus `<Explainer>`) and a one-line summary.
- Each area tab lists its sub-scores as plain sentences with explainers, ordered weakest first.
- Keyword, pages, issues and question-matrix tables move behind Technical details or a
  "See all …" link. Their column headers get plain names.

As built:

- The three area cards sit above the tabs; the tabs carry the plain area names and the
  sub-scores, weakest first, with scores that have no number last as "Not counted yet".
- The summary reads "Acme Docs is in fair shape. Weakest: Answer-ready (needs work)."
- Issues stay visible as "What to fix" (plain titles from the rules); their fix and check
  text, locations and "Hand to Claude" share one Technical details section per card.
- The pages table and Search Console's top searches sit under Technical details with plain
  headers. There is no question-matrix table yet; it goes under Technical details when it ships.
- Rule titles are plain ("No guide to your site for AI assistants"); stored actions take the new
  title on the next scan.

### 5.3 Actions

- Board columns are renamed as in §3.
- Each card leads with the plain title, why it matters, the effort and impact phrases, who's
  on it, and the PR link (from the actions CLI work).
- Evidence, source, rule key and the Hand to Claude prompt sit behind Technical details.

As built:

- The board stays a grouped list filtered by status; the six names are used for tags, the
  filter, counts, history and controls.
- Group headings are "Big wins", "Worth doing" and "Small wins".
- Rule reasons are plain in `lib/scan/issue-rules.ts`, while `fix` and `check` stay exact and
  sit under Technical details.
- The fix, check, source, rule key, evidence, related docs and "Hand to Claude" share one
  Technical details section per card.

### 5.4 Settings and Agents

- Each section opens with one line on what it is for.
- Key and source status reads "Connected" or "Not connected yet", followed by how to connect
  it. Variable names appear only inside the setup steps.

As built:

- Settings has six sections, each with a one-line purpose (`lib/explain/settings.ts`): Products,
  Schedules, Connections, Budget, Backups and More settings. "API keys" is now **Connections**.
  Agents' panels (research, Find ideas, weekly report, research refresh, recent runs) have theirs
  in `lib/explain/agents.ts`.
- A connected key reads "Connected", a missing one "Not connected yet"; a paid source that cannot
  be connected yet reads "Not available yet" and has no setup steps.
- Setting names (`HARBOUR_*`, `.env`) appear only inside Technical details; the Connections
  table and the schedules read in words.
- "Discovery" is **Find ideas**. A run's page headline is plain (Waiting for its turn, Running now,
  Done, Didn't finish, Stopped); its step-by-step log sits under Technical details.
- Sources and Devices follow the same rules: a one-line intro, plain statuses, and connection steps
  under Technical details.
- The sidebar badge on Actions reads "N things worth doing", the same words as Today's sub-line.

### 5.5 Messages

Every user-facing error, notice and empty state is rewritten per principle 4. Messages live
beside their component or in `lib/explain/`, not scattered as inline literals across files.

## 6. Scoring change: Preferred Sources

Google Preferred Sources is a Top Stories (news) feature, so it should not weigh on product sites.

- **Product config:** add optional `kind: "news" | "product"` to products in
  `harbour.config.json`, default `"product"`. Validate it with zod, and document it in the
  README and `harbour.config.example.json`.
- **AEO formula v2:**
  - For `product` sites, `aeo.preferredSources` becomes "freshness" only (3+ URLs updated in
    30 days → 100) with weight 0.25.
  - `news` sites keep the v1 definition.
  - The formula version is bumped. History shows a note at the first v2 score: "Scoring
    updated: Preferred Sources now only counts for news sites."
- **Rule:** the `no-preferred-sources` rule only fires for `news` products. Existing open
  rule actions close through the normal rule-sync path, since the rule no longer applies.

As built:

- `Product.kind` (`"product"` by default, validated by zod) feeds `ScoreContext.productKind`;
  `FORMULA_VERSION` is `"v2"`. `aeo.preferredSources` is shown as "Fresh pages" for product sites.
- `no-preferred-sources` returns `clear` for product sites, so the rule sync resolves an old open
  action with its ordinary "Resolved" note rather than a special path.
- A score change is hidden only for an area whose formula the version changed (v2: Answer-ready on
  product sites), since that change measures the formula rather than the site; a version with no
  entry in `lib/explain/scoring-notes.ts` hides every area. The Product page
  shows the history note (`formulaChange`, `lib/explain/scoring-notes.ts`) for product sites while
  the change is within the 30-day trend window.

## 7. Testing

- **`lib/explain`:**
  - Every sub-score key in the current formula has a complete entry (all four parts
    non-empty).
  - Every data source has an entry.
  - `verdictFor` boundaries are 49/50, 69/70 and 84/85, plus null.
  - The briefing picks the documented opportunity, and its fixtures cover healthy, broken and
    no-data cases.
- **Components:** rendering, keyboard toggling, `aria-expanded`, and light/dark snapshots on
  `/design`.
- **E2E smoke (Today, Product, Actions, Settings):**
  - the briefing or summary line is visible;
  - no raw codes appear outside Technical details: no `SEO|GEO|AEO` as a heading, no
    `HARBOUR_[A-Z_]+`, no `geo.` or `aeo.` keys.
- **Scoring v2:** the formula tests for product and news kinds, the version bump, and the rule
  gating.

## 8. Order of work

Each step is its own reviewed change.

1. `lib/explain` and the shared components (plus `/design` examples).
2. Today.
3. Actions (done). This waited for the `pnpm actions` / PR-link change, since it touches the same
   components.
4. Product page.
5. Settings, Agents and messages (done).
6. Scoring v2 (Preferred Sources) (done).

AGENTS.md gains a short "Plain language" rule under Design system pointing to this spec and
`lib/explain`, so new UI follows the same pattern.
