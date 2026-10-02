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

**Who's on it** (derived from the latest event and the PR link):
- "Claude is on it"
- "Pull request waiting for your OK"
- "Waiting for you"
- "New idea, not decided yet"

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
  phrase ("up 2 this month", "steady").
- `<Explainer>`: the visible one-liner, plus a "What's this?" disclosure button
  (`aria-expanded`, one owner per label) revealing the four parts and an optional "Next step"
  link to the matching action.
- `<TechnicalDetails>`: a native `<details>` element, closed by default. It remembers the
  owner's choice per section in localStorage, wrapped in try/catch, and is never required.
- `<EmptyState>`: says what will appear here, when, and why.

## 5. Screens

### 5.1 Today

1. Date and "last checked …".
2. **Briefing sentence:** overall health plus the single biggest opportunity, chosen by rule:
   the lowest area verdict across products that has an open action. Under it, a sub-line:
   "N things worth doing · Claude is handling M · nothing is broken" (or what is broken).
3. **Product table:** one row per product, one column per area, showing `<VerdictLine>` in
   compact form.
4. **Worth doing next:** the top 3 actions as plain cards. Each card has a title, a one-line
   reason, a tag (area plus effort phrase) and who's on it.
5. **Calm notices:** backup, source health and cost, each written per principle 4.

### 5.2 Product page

- Opens with three area cards (`<VerdictLine>` plus `<Explainer>`) and a one-line summary.
- Each area tab lists its sub-scores as plain sentences with explainers, ordered weakest first.
- Keyword, pages, issues and question-matrix tables move behind Technical details or a
  "See all …" link. Their column headers get plain names.

### 5.3 Actions

- Board columns are renamed as in §3.
- Each card leads with the plain title, why it matters, the effort and impact phrases, who's
  on it, and the PR link (from the actions CLI work).
- Evidence, source, rule key and the Hand to Claude prompt sit behind Technical details.

### 5.4 Settings and Agents

- Each section opens with one line on what it is for.
- Key and source status reads "Connected" or "Not connected yet", followed by how to connect
  it. Variable names appear only inside the setup steps.

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
3. Actions. This waits for the `pnpm actions` / PR-link change, since it touches the same
   components.
4. Product page.
5. Settings, Agents and messages.
6. Scoring v2 (Preferred Sources).

AGENTS.md gains a short "Plain language" rule under Design system pointing to this spec and
`lib/explain`, so new UI follows the same pattern.
