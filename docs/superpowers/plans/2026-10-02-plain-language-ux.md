# Plain-language UX (steps 1–2: explanations library, shared components, Today) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harbour explains itself in plain, calm words: a pure, tested library of fixed explanations (`lib/explain/`), four shared components (`VerdictLine`, `Explainer`, `TechnicalDetails`, `EmptyState`) on `/design`, and a Today page that leads with a one-sentence briefing, verdicts per product and area, "Worth doing next" cards that say who's on each, and calm notices — with every number and code still one click away.

**Architecture:** `lib/explain/` is data plus pure functions with no I/O and only type imports from the database and scan layers, so client components can use it without bundling them. Today's data module (`lib/today/`) gains one new database read (`lib/actions/active-work.ts`: every active action with who last changed its status) and feeds the pure `buildBriefing()`. Components render the library's words; the old numeric score table survives unchanged inside `<TechnicalDetails>`.

**Tech Stack:** existing stack only (Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 with the semantic tokens in `design/tokens.css`, Drizzle/SQLite, Vitest + Testing Library (`fireEvent`; no user-event), Playwright, Biome, pnpm). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§8 steps 1 and 2 in full; steps 3–6 outlined at the end as separate future plans). **Rules:** `AGENTS.md`. **Builds on:** the Phase 4 actions plan and the actions-CLI change (`prUrl`, actor `claude`, `linkPullRequest`).

## Global Constraints

Copied verbatim from the spec and `AGENTS.md`; every task's requirements include this section.

**From the spec**

- "No change to what Harbour measures or stores."
- "No AI-generated explanations: the explanations are fixed, reviewed text."
- "The Second Brain viewer is unchanged."
- "**Meaning first, numbers second.** Lead with a verdict or a plain sentence, and keep the number small beside it for tracking."
- "**One sentence always visible, more on request.** Every score, section and status has a one-line plain explanation. "What's this?" opens the full four parts: what it is, why Harbour checks it, what to do, why it's worth it."
- "**Technical detail is never removed, only tucked away.** Raw evidence, sub-score keys, codes and formulas live behind a "Technical details" disclosure, closed by default."
- "**Every message answers "what happened, does it matter, what do I do".** No bare "failed", no environment-variable names as the message (they may appear inside Technical details or setup steps)."
- "**Calm density.** Fewer, larger, well-spaced items, with full tables one click away. No colour as the only signal."
- Area names: "SEO | **Found on Google** | Google can find, read and rank your pages." / "GEO | **Recommended by AI assistants** | ChatGPT, Perplexity, Gemini and Claude can reach your site, know who you are, and cite you." / "AEO | **Answer-ready** | Your pages give short, direct answers that Google and AI assistants can quote."
- "Codes appear only in Technical details and in the Second Brain research."
- Verdict bands: "≥ 85 | Strong", "70–84 | Good", "50–69 | Fair", "< 50 | Needs work". "Bands apply per area and per sub-score, on 0–100."
- "When data is missing, the verdict line says so ("speed data still arriving", "not connected yet") instead of implying a worse score. Missing data is a gap, never a zero (AGENTS.md)."
- Wording: "collectors → data sources", "paid sources → paid data", "impact high/medium/low → Big win / Worth doing / Small win", "effort small/medium/large → quick job / an afternoon / a project".
- Action columns: "suggested → New ideas", "open → To do", "in_progress → In progress", "done → Done", "snoozed → Snoozed", "dismissed → Dismissed". "Status values in the data model are unchanged."
- Who's on it: ""Claude is on it"", ""Pull request waiting for your OK"", ""Waiting for you"", ""New idea, not decided yet"".
- "Each component works in light and dark, uses semantic tokens only, is fully keyboard-accessible, and appears on `/design`."
- `<TechnicalDetails>`: "a native `<details>` element, closed by default. It remembers the owner's choice per section in localStorage, wrapped in try/catch, and is never required."
- "Messages live beside their component or in `lib/explain/`, not scattered as inline literals across files."

**From AGENTS.md**

- File size: "React components (`*.tsx`) | 200 lines | 300 lines", "Other TypeScript (`*.ts`) | 300 lines | 400 lines", "Tests | 400 lines | 600 lines", "CSS / tokens | 300 lines | 500 lines". "**Hard limit:** never commit a file over it."
- "Components use **semantic tokens only** (`--surface`, `--ink`, `--accent`…). Never hardcode colours, and never reference primitive palette tokens directly in components."
- "Text sizes in rem via the type scale; no arbitrary px font sizes."
- "Every new component works in light and dark, and appears on `/design`."
- "Accessibility is part of done: accessible names, visible focus, full keyboard path, one owner per interactive label."
- "A caught failure is recorded or propagated — never logged and turned into success or an empty result. Missing data is a gap, never a zero."
- "**Types are strict.** `strict: true`, no `any`, no non-null `!` without a comment explaining why it is safe. Validate external data (APIs, agent output, frontmatter) with zod at the boundary." (Biome errors on `!`, tests included: guard instead.)
- "**No dead code.**" "**No duplication of logic.** Second copy → extract a shared helper." "**Names say what things are.**" "**Functions stay small** (aim < 40 lines)."
- "Tests bind the real production code path, not test-only copies." "No paid API calls in tests — use recorded fixtures." "New logic ships with tests; bug fixes ship with a regression test that fails without the fix."
- "This repo is public. Never commit personal data: real products, names, emails, hostnames, tailnet names, home paths or research. Use fictional examples (`example.com`, `owner@example.com`)." Fixtures here use Acme Docs, Lighthouse Café, Fern & Field and `https://github.com/example/site/pull/<n>`.
- README: "**Update it in the same change** whenever you add or change a feature…". Each Today task below edits the README lines it makes wrong.
- "Small, focused commits with a clear message (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)." Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `--no-verify`.
- "Run `pnpm check` (typecheck, lint, format, size, tests) before committing."

**Environment**

- Node 22: prefix every command with `source ~/.nvm/nvm.sh &&`.
- Next.js 16 has breaking changes. This plan uses only `next/link` (read `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`) and the `"use client"` directive (read `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`: props of a client entry component must be serialisable — `Explainer` and `TechnicalDetails` take only strings, plain objects and server-rendered children).
- Code blocks in this plan may run past Biome's 100-column format width: run `pnpm fix` (format only) before `pnpm lint` in every task.
- `lib/explain/**` may import **values** only from `lib/explain/**`, `lib/scan/labels.ts` and `lib/scan/scoring/sub-score.ts` (both pure); everything else (`lib/scan/views`, `lib/scan/issues`, `lib/actions/types`, `lib/db/schema`, `lib/scan/types`) is `import type` only, so client components never bundle the database layer.

## Review Focus

Inputs the spec implies that are most likely to bite the owner; each has a pinned test in the task named.

1. **Pruned or unusual action history.** An action whose status-changing events were pruned (50 PR-link events), or one moved by `scan`/`system`, must never read "Claude is on it"; it reads "Waiting for you". Tests: Task 7 (`whoIsOnIt` with a `null` actor), Task 15 ("has no actor once pruning removed every status change").
2. **A scanned product with no scores at all** (every collector failed): the briefing says there is no verdict, the table says "No score yet" with a reason, never "Needs work" or 0. Tests: Task 1 (`NaN`/null), Task 8 ("no data"), Task 18 ("a scanned product with no scores").
3. **Stored breakdowns from an older formula** (unknown key, different evidence wording): a plain line still appears (the verdict's sentence), never a crash or a code. Test: Task 3 (`subScoreLine` fallbacks).
4. **Blocked browser storage** (private mode, policy): `TechnicalDetails` still opens and closes. Test: Task 12 ("still opens and closes when storage is blocked").
5. **Agent-written reasons that are long, multi-line or empty**: the card shows one sentence of at most 160 characters, or no reason line at all. Tests: Task 17 (`firstSentence` cases; "leaves out an empty reason").

## Decisions (spec ambiguities resolved here)

1. **"Latest event" for who's on it** is the latest event that *changed the status* (its creation counts; `from !== to`). A PR link writes an event from a status to itself; counting it would make an owner-started action look like Claude's. Spec §3 is updated with the exact rules in Task 7.
2. **Who's on it rules:** `suggested` → New idea, not decided yet; `in_progress` with a `prUrl` (whoever started it) → Pull request waiting for your OK; `in_progress` last moved by Claude → Claude is on it; any other `in_progress` (owner, scan, system, or unknown after pruning) → Waiting for you; `open` → Waiting for you (including a suggestion Claude accepted: the owner still has to do it); `done`/`snoozed`/`dismissed` → no line.
3. **"Claude is handling M"** counts only "Claude is on it"; a PR waiting for review is the owner's move.
4. **Biggest opportunity** uses *active* actions (open or in progress), matching "N things worth doing"; areas without a score are skipped (a gap is never the lowest); ties go to the earlier product in config order, then SEO → GEO → AEO. Overall health is the band of the rounded mean of every area score there is; one configured product reads "Your site", more read "Your sites". With no opportunity the sentence is the health clause alone. Spec §5.1 is updated in Task 8.
5. **Trend phrase** reads "up 2 since the last check" (the stored delta is against the previous scan, not a month). The spec's example is updated in Task 10.
6. **Sub-score one-liners** read the numbers out of the stored evidence text with patterns pinned by tests against the real scorer's output; unmatched wording falls back to the verdict's sentence. The breakdown stores no structured numbers, and changing storage is a spec non-goal.
7. **Data sources** cover the four collectors and the four paid sources in `lib/costs/paid-sources.ts` (none collected yet, so their setup steps say so honestly).
8. **No latest-event helper existed** in `lib/actions`; Task 15 adds `activeWork()`. Its correlated subquery is raw SQL on purpose: Drizzle renders columns unqualified inside `sql` subqueries (`"action_id" = "id"` binds `id` to `action_events`), verified while writing this plan; the regression test fails on that form.
9. **The sample Today** gets its briefing from the same `buildBriefing()` over its sample data, plus a visible "Sample" tag above the sentence (the sample banner stays).
10. **The cost meter's wording** ("paid data") changes in step 2 because spec §5.1 asks for calm cost notices; the meter is shared with Settings, whose e2e assertion is updated in the same task.
11. **The numeric score table** (SEO/GEO/AEO headers, deltas, the 30-day SEO sparkline) is kept unchanged inside Today's Technical details: the numbers stay one click away.
12. **Tones:** no red for verdicts — Strong/Good use `--good`, Fair uses `--ink`, Needs work uses `--warn`, gaps use `--ink-muted`; the word is always printed, so colour is never the only signal.
13. **Notices** sit in a "Behind the scenes" section at the end (spec §5.1 order); the briefing's sub-line names anything broken at the top.
14. **`STATUS_COLUMN`, `subScoreExplanation`, `sourceStatusPhrase`** ship in step 1 as the spec's library surface with tests; steps 3–5 are their first UI users.
15. **The analyst prompt** (spec §4.1) and the AGENTS.md "Plain language" rule land in step 1 (Tasks 9 and 14).
16. **`Explainer` button names** are "What's this? (topic)" — the topic in a visually hidden span — so several on a page each have their own name.

## File Structure

```
lib/explain/
  four-parts.ts            FourParts type, PART_ORDER, PART_LABELS, isComplete()
  verdict.ts (+test)       VERDICT_BANDS, verdictFor(), trendPhrase(), verdictBandsText(), GAP_REASONS
  areas.ts (+test)         AREA_ORDER, AREAS (name, one-liner, four parts), areaKeyOf()
  subscores/
    entry.ts               SubScoreExplanation type, numbersIn()
    missing.ts (+test)     missingLine(): plain words for a missing sub-score's stored reason
    seo.ts (+test)         SEO_EXPLANATIONS (4 keys)
    geo.ts (+test)         GEO_EXPLANATIONS (5 keys)
    aeo.ts (+test)         AEO_EXPLANATIONS (4 keys)
    index.ts (+test)       SUB_SCORE_EXPLANATIONS, subScoreExplanation(), subScoreLine()
  sources.ts (+test)       SOURCES (8), sourceName(), sourceStatusPhrase(), sourceTrouble()
  actions.ts (+test)       IMPACT_PHRASE, EFFORT_PHRASE, STATUS_COLUMN, WHO_PHRASE, whoIsOnIt()
  briefing.ts (+test)      buildBriefing()
components/explain/
  VerdictLine.tsx (+test)       verdict word, small number, trend; full and compact forms
  Explainer.tsx (+test)         "use client": one-liner + "What's this?" disclosure
  TechnicalDetails.tsx (+test)  "use client": native <details>, remembered per section
  EmptyState.tsx (+test)        what will appear, when, why
components/design/
  Example.tsx                   shared labelled example wrapper (moved out of OpsExamples)
  ExplainExamples.tsx (+test)   /design: the four explain components
  TodayExamples.tsx (+test)     /design: briefing, verdict table, action cards, empty state
  today-example-data.ts         fictional Today data built from a configured product
lib/actions/active-work.ts (+test)   every active action with who last changed its status
lib/today/reason.ts (+test)          firstSentence()
components/today/
  BriefingText.tsx              briefing sentence (h1 on Today, h3 on /design) and sub-line
  TodayHeader.tsx               date, "last checked …", briefing
  VerdictTable.tsx (+test)      product × area verdicts
  ScoresSection.tsx (+test)     verdict table, area explainers, numbers under Technical details
  WorthDoingNext.tsx            top three cards, empty state, "N more" link
  ActionCard.tsx (+test)        rewritten: title, reason, area · effort, impact, who's on it
  BackupNotice.tsx, SourceFailures.tsx (+test), CostMeter.tsx, SampleBanner.tsx   calm notices
tests/e2e/plain-language.ts          expectPlainLanguage(): no codes outside Technical details
```

Modified: `lib/today/{types,from-actions,from-scans,sample}.ts` (+tests), `lib/actions/views.ts` (+test: `activeImpactCounts` removed), `lib/analyst/prompt.ts` (+test), `components/today/{TodayView,ScoreTable.test}.tsx`, `components/design/{OpsExamples,ops-example-data}.ts(x)`, `app/(app)/design/page.tsx`, `tests/e2e/{shell,scans,actions,settings}.spec.ts`, `README.md`, `AGENTS.md`, the spec.

---

## Step 1 — `lib/explain` and the shared components

### Task 1: Verdict bands and trend phrases

**Files:**
- Create: `lib/explain/four-parts.ts`
- Create: `lib/explain/verdict.ts`
- Test: `lib/explain/verdict.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type FourParts = { what: string; why: string; todo: string; worth: string }`, `PART_ORDER: readonly (keyof FourParts)[]`, `PART_LABELS: Readonly<Record<keyof FourParts, string>>`, `isComplete(parts: FourParts): boolean`
  - `type VerdictTone = "strong" | "good" | "fair" | "weak" | "gap"`, `type VerdictLabel = "Strong" | "Good" | "Fair" | "Needs work" | "No score yet"`, `type Verdict = { label: VerdictLabel; tone: VerdictTone; sentence: string }`
  - `VERDICT_BANDS` (4 bands, highest first), `verdictFor(score: number | null, missingReason?: string): Verdict`, `trendPhrase(delta: number | null): string | null`, `verdictBandsText(): string`, `GAP_REASONS: { notChecked: "Not checked yet."; dataMissing: "The data for this didn't arrive." }`

- [ ] **Step 1: Write the failing test**

`lib/explain/verdict.test.ts`:

```ts
import { GAP_REASONS, trendPhrase, VERDICT_BANDS, verdictBandsText, verdictFor } from "./verdict";

describe("verdictFor", () => {
  it.each([
    [100, "Strong"],
    [85, "Strong"],
    [84, "Good"],
    [70, "Good"],
    [69, "Fair"],
    [50, "Fair"],
    [49, "Needs work"],
    [0, "Needs work"],
  ] as const)("reads %d as %s", (score, label) => {
    expect(verdictFor(score).label).toBe(label);
  });

  it("gives each band its own tone and sentence", () => {
    expect(verdictFor(90)).toEqual({
      label: "Strong",
      tone: "strong",
      sentence: "Doing really well. Keep it up.",
    });
    expect(verdictFor(75)).toEqual({
      label: "Good",
      tone: "good",
      sentence: "In good shape, with a little room to improve.",
    });
    expect(verdictFor(60)).toEqual({
      label: "Fair",
      tone: "fair",
      sentence: "Working, but there's clear room to improve.",
    });
    expect(verdictFor(30)).toEqual({
      label: "Needs work",
      tone: "weak",
      sentence: "Holding you back, so it's worth fixing first.",
    });
  });

  it("reads no score as a gap with its reason, never as Needs work", () => {
    expect(verdictFor(null, "Speed data is still arriving.")).toEqual({
      label: "No score yet",
      tone: "gap",
      sentence: "Speed data is still arriving.",
    });
    expect(verdictFor(null).sentence).toBe("No data yet, so there's no verdict.");
    expect(verdictFor(null, "  ").sentence).toBe("No data yet, so there's no verdict.");
    // Review Focus 2: a number that isn't one is a gap too.
    expect(verdictFor(Number.NaN, GAP_REASONS.notChecked)).toEqual({
      label: "No score yet",
      tone: "gap",
      sentence: "Not checked yet.",
    });
  });

  it("puts a fraction in the band its number falls in, and out-of-range numbers at the ends", () => {
    expect(verdictFor(84.9).label).toBe("Good");
    expect(verdictFor(120).label).toBe("Strong");
    expect(verdictFor(-1).label).toBe("Needs work");
  });
});

describe("trendPhrase", () => {
  it("says up, down or steady since the last check, and nothing without a change to read", () => {
    expect(trendPhrase(2)).toBe("up 2 since the last check");
    expect(trendPhrase(-3)).toBe("down 3 since the last check");
    expect(trendPhrase(0)).toBe("steady");
    expect(trendPhrase(null)).toBeNull();
    expect(trendPhrase(Number.NaN)).toBeNull();
  });
});

describe("verdictBandsText", () => {
  it("lists every band with its range", () => {
    expect(VERDICT_BANDS.map((band) => band.min)).toEqual([85, 70, 50, 0]);
    expect(verdictBandsText()).toBe(
      "Strong (85 or more), Good (70–84), Fair (50–69), Needs work (under 50)",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/verdict.test.ts`
Expected: FAIL — `Failed to resolve import "./verdict"`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/four-parts.ts`:

```ts
/**
 * The four parts behind "What's this?" (spec §2): what it is, why Harbour checks it, what to do
 * and why it's worth it.
 */
export type FourParts = { what: string; why: string; todo: string; worth: string };

/** The parts in the order they are shown. */
export const PART_ORDER: readonly (keyof FourParts)[] = ["what", "why", "todo", "worth"];

/** Each part's heading. */
export const PART_LABELS: Readonly<Record<keyof FourParts, string>> = {
  what: "What it is",
  why: "Why Harbour checks it",
  todo: "What to do",
  worth: "Why it's worth it",
};

/** True when every part has words in it: an explainer never opens onto a blank. */
export function isComplete(parts: FourParts): boolean {
  return PART_ORDER.every((part) => parts[part].trim().length > 0);
}
```

`lib/explain/verdict.ts`:

```ts
export type VerdictTone = "strong" | "good" | "fair" | "weak" | "gap";
export type VerdictLabel = "Strong" | "Good" | "Fair" | "Needs work" | "No score yet";
export type Verdict = { label: VerdictLabel; tone: VerdictTone; sentence: string };

type Band = {
  min: number;
  label: Exclude<VerdictLabel, "No score yet">;
  tone: Exclude<VerdictTone, "gap">;
  sentence: string;
};

/** Spec §3's bands, highest first: each starts at `min` and runs up to the next one. */
export const VERDICT_BANDS: readonly [Band, Band, Band, Band] = [
  { min: 85, label: "Strong", tone: "strong", sentence: "Doing really well. Keep it up." },
  {
    min: 70,
    label: "Good",
    tone: "good",
    sentence: "In good shape, with a little room to improve.",
  },
  { min: 50, label: "Fair", tone: "fair", sentence: "Working, but there's clear room to improve." },
  {
    min: 0,
    label: "Needs work",
    tone: "weak",
    sentence: "Holding you back, so it's worth fixing first.",
  },
];

/** Plain reasons for a missing score that Today can give without reading the breakdown. */
export const GAP_REASONS = {
  notChecked: "Not checked yet.",
  dataMissing: "The data for this didn't arrive.",
} as const;

const NO_DATA = "No data yet, so there's no verdict.";

/**
 * The verdict for a 0–100 score: its band's word, tone and sentence. No score (or a value that
 * is not a number) is a gap carrying the reason given — never "Needs work": missing data is not
 * a zero.
 */
export function verdictFor(score: number | null, missingReason?: string): Verdict {
  if (score === null || !Number.isFinite(score)) {
    return { label: "No score yet", tone: "gap", sentence: missingReason?.trim() || NO_DATA };
  }
  // A stored score is 0–100; anything below 0 still reads as the lowest band.
  const band = VERDICT_BANDS.find((b) => score >= b.min) ?? VERDICT_BANDS[3];
  return { label: band.label, tone: band.tone, sentence: band.sentence };
}

/** The change since the last check in words; null when either check had no number. */
export function trendPhrase(delta: number | null): string | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (delta === 0) return "steady";
  return `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} since the last check`;
}

/** The bands as one line, for prompts: "Strong (85 or more), Good (70–84), …". */
export function verdictBandsText(): string {
  return VERDICT_BANDS.map((band, i) => {
    const above = VERDICT_BANDS[i - 1];
    if (!above) return `${band.label} (${band.min} or more)`;
    if (band.min === 0) return `${band.label} (under ${above.min})`;
    return `${band.label} (${band.min}–${above.min - 1})`;
  }).join(", ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/verdict.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/explain/four-parts.ts lib/explain/verdict.ts lib/explain/verdict.test.ts
git commit -m "$(cat <<'EOF'
feat(explain): verdict bands and trend phrases

Strong / Good / Fair / Needs work from spec §3, a gap verdict for a missing
score, and "up 2 since the last check" phrasing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The three areas in plain words

**Files:**
- Create: `lib/explain/areas.ts`
- Test: `lib/explain/areas.test.ts`

**Interfaces:**
- Consumes: `FourParts`, `isComplete` (Task 1); `type AreaKey` from `@/lib/scan/views`; `type IssueArea` from `@/lib/scan/issues`.
- Produces: `type AreaExplanation = { key: AreaKey; code: IssueArea; name: string; oneLiner: string; parts: FourParts }`, `AREA_ORDER: readonly AreaKey[]` (`["seo","geo","aeo"]`), `AREAS: Readonly<Record<AreaKey, AreaExplanation>>`, `areaKeyOf(area: IssueArea): AreaKey`.

- [ ] **Step 1: Write the failing test**

`lib/explain/areas.test.ts`:

```ts
import { AREA_KEYS } from "@/lib/scan/views";
import { AREA_ORDER, AREAS, areaKeyOf } from "./areas";
import { isComplete } from "./four-parts";

describe("AREAS", () => {
  it("uses the spec's plain names and one-liners, in the scan's area order", () => {
    expect(AREA_ORDER).toEqual(AREA_KEYS);
    expect(AREA_ORDER.map((key) => AREAS[key].name)).toEqual([
      "Found on Google",
      "Recommended by AI assistants",
      "Answer-ready",
    ]);
    expect(AREAS.seo.oneLiner).toBe("Google can find, read and rank your pages.");
    expect(AREAS.geo.oneLiner).toBe(
      "ChatGPT, Perplexity, Gemini and Claude can reach your site, know who you are, and cite you.",
    );
    expect(AREAS.aeo.oneLiner).toBe(
      "Your pages give short, direct answers that Google and AI assistants can quote.",
    );
  });

  it.each(AREA_ORDER)("gives %s all four parts, with no codes in the words", (key) => {
    const area = AREAS[key];
    expect(area.key).toBe(key);
    expect(area.code).toBe(key.toUpperCase());
    expect(isComplete(area.parts)).toBe(true);
    for (const text of [area.name, area.oneLiner, ...Object.values(area.parts)]) {
      expect(text).not.toMatch(/\b(SEO|GEO|AEO)\b/);
    }
  });

  it("maps an action's area code to its key", () => {
    expect(areaKeyOf("SEO")).toBe("seo");
    expect(areaKeyOf("GEO")).toBe("geo");
    expect(areaKeyOf("AEO")).toBe("aeo");
  });

  it("knows a blank part is incomplete", () => {
    expect(isComplete({ ...AREAS.seo.parts, worth: " " })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/areas.test.ts`
Expected: FAIL — `Failed to resolve import "./areas"`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/areas.ts`:

```ts
import type { IssueArea } from "@/lib/scan/issues";
import type { AreaKey } from "@/lib/scan/views";
import type { FourParts } from "./four-parts";

/** An area in the owner's words. Its code (SEO, GEO, AEO) appears only in Technical details. */
export type AreaExplanation = {
  key: AreaKey;
  code: IssueArea;
  name: string;
  oneLiner: string;
  parts: FourParts;
};

/**
 * The areas in display order. Defined here rather than imported from lib/scan/views, so client
 * components that use the area names never bundle the database layer.
 */
export const AREA_ORDER: readonly AreaKey[] = ["seo", "geo", "aeo"];

export const AREAS: Readonly<Record<AreaKey, AreaExplanation>> = {
  seo: {
    key: "seo",
    code: "SEO",
    name: "Found on Google",
    oneLiner: "Google can find, read and rank your pages.",
    parts: {
      what:
        "How easily Google can find your pages, read them and show them to people searching. " +
        "Harbour combines four checks: the health of your pages, whether Google is allowed in, " +
        "how fast your site feels on a phone, and whether Google is showing you more or less often.",
      why:
        "Most people still start with a Google search. If Google can't reach or understand a " +
        "page, that page can't bring you visitors, however good it is.",
      todo:
        "Start with the weakest check and the matching ideas under Worth doing next. Most fixes " +
        "are small edits to page titles, descriptions or links.",
      worth:
        "Every visitor from Google is free, and small fixes here keep paying off for as long as " +
        "the page is online.",
    },
  },
  geo: {
    key: "geo",
    code: "GEO",
    name: "Recommended by AI assistants",
    oneLiner:
      "ChatGPT, Perplexity, Gemini and Claude can reach your site, know who you are, and cite you.",
    parts: {
      what:
        "Whether AI assistants such as ChatGPT, Perplexity, Gemini and Claude can read your site, " +
        "understand who is behind it and point people to it in their answers.",
      why:
        "More and more people ask an AI assistant instead of searching. Assistants can only " +
        "recommend sites they're allowed to read and can make sense of.",
      todo:
        "Let AI crawlers (the programs assistants send to read websites) in, add a short " +
        "llms.txt guide, say clearly who runs the site, and answer questions plainly. Worth doing " +
        "next lists the changes for each site.",
      worth:
        "When an assistant names you, it works like a personal recommendation, and it often comes " +
        "with a link people trust.",
    },
  },
  aeo: {
    key: "aeo",
    code: "AEO",
    name: "Answer-ready",
    oneLiner: "Your pages give short, direct answers that Google and AI assistants can quote.",
    parts: {
      what:
        "How well your pages answer common questions in a short, direct way, so Google and AI " +
        "assistants can lift the answer straight into their results.",
      why:
        "Google often shows an answer at the top of its results, and assistants quote whole " +
        "sentences. Pages set out as clear questions and answers are the ones that get picked.",
      todo:
        "Add a few common questions as headings, answer each in two or three sentences right " +
        "underneath, and mark up FAQ pages so machines can tell they're questions and answers.",
      worth:
        "Being the quoted answer puts your name at the very top, ahead of every ordinary link.",
    },
  },
};

const KEY_OF: Readonly<Record<IssueArea, AreaKey>> = { SEO: "seo", GEO: "geo", AEO: "aeo" };

/** The area key for an action's area code. */
export function areaKeyOf(area: IssueArea): AreaKey {
  return KEY_OF[area];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/areas.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/explain/areas.ts lib/explain/areas.test.ts
git commit -m "$(cat <<'EOF'
feat(explain): plain names and explainers for the three areas

Found on Google, Recommended by AI assistants and Answer-ready, each with its
one-liner and the four parts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sub-score lines and the SEO explanations

**Files:**
- Create: `lib/explain/subscores/entry.ts`
- Create: `lib/explain/subscores/missing.ts`
- Create: `lib/explain/subscores/seo.ts`
- Create: `lib/explain/subscores/index.ts`
- Test: `lib/explain/subscores/missing.test.ts`, `lib/explain/subscores/seo.test.ts`, `lib/explain/subscores/index.test.ts`

**Interfaces:**
- Consumes: `FourParts`, `isComplete` (Task 1), `verdictFor` (Task 1); `plural` from `@/lib/scan/scoring/sub-score`; `type ScoreBreakdownEntry` from `@/lib/db/schema`. Tests use the real scorer through `@/tests/helpers/scoring` (`scoreOf`, `entryOf`, `ACME_SCAN`, `ALL_OK`, `NOW`, `cwv`, `crawlSite`, `readiness`, `searchConsole`, `daysOf`).
- Produces:
  - `type SubScoreExplanation = { key: string; name: string; parts: FourParts; summarise: (evidence: string) => string | null }`
  - `numbersIn<const K extends string>(evidence: string, pattern: RegExp, names: readonly K[]): Record<K, number> | null`
  - `missingLine(evidence: string): string`
  - `SEO_EXPLANATIONS: readonly SubScoreExplanation[]` (keys `seo.technical`, `seo.indexability`, `seo.cwv`, `seo.searchTrend`)
  - `SUB_SCORE_EXPLANATIONS: readonly SubScoreExplanation[]`, `subScoreExplanation(key: string): SubScoreExplanation | null`, `subScoreLine(entry: Pick<ScoreBreakdownEntry, "key" | "score" | "evidence">): string` — all from `@/lib/explain/subscores`.

The evidence strings these patterns read are produced by `lib/scan/scoring/seo*.ts`; for the Acme fixture (`ACME_SCAN`) they are, verbatim:

```
seo.technical      6 pages crawled, 5 answered 2xx. Of 5 HTML pages: … 2 of 6 pages link to a broken internal page (−8.3).
seo.indexability   Sitemap valid (5 URLs); Googlebot allowed (some paths disallowed); 3 of 4 crawled sitemap URLs answered 2xx.
seo.cwv            PageSpeed this scan: mobile performance 72, field INP 260 ms (rated 80).
seo.searchTrend    59 impressions a day over 28 days in the last 28 days vs 50 a day over 28 days in the 28 days before (+18.0%).
```

- [ ] **Step 1: Write the failing tests**

`lib/explain/subscores/missing.test.ts`:

```ts
import {
  ACME_SCAN,
  ALL_OK,
  cwv,
  daysOf,
  entryOf,
  NOW,
  scoreOf,
  searchConsole,
} from "@/tests/helpers/scoring";
import { missingLine } from "./missing";

const DAY_MS = 24 * 60 * 60_000;
const without = (collector: string) => ACME_SCAN.filter((o) => o.collector !== collector);
const lineFor = (result: ReturnType<typeof scoreOf>, key: string) =>
  missingLine(entryOf(result, key)?.evidence ?? "");

describe("missingLine", () => {
  it("reads the real scorer's reasons for sources that are not connected or failed", () => {
    const result = scoreOf(
      without("pagespeed").filter((o) => o.collector !== "search-console"),
      { ...ALL_OK, pagespeed: "not_configured", "search-console": "failed" },
    );
    expect(lineFor(result, "seo.cwv")).toBe("Not connected yet, so it isn't counted.");
    expect(lineFor(result, "seo.searchTrend")).toBe(
      "The data didn't arrive in the last check, so it isn't counted for now.",
    );
    expect(lineFor(result, "geo.aiEngines")).toBe(
      "Needs paid data, which isn't connected yet, so it isn't counted.",
    );
    expect(lineFor(result, "aeo.snippets")).toBe(
      "Needs paid data, which isn't connected yet, so it isn't counted.",
    );
  });

  it("says speed data is still arriving when PageSpeed was skipped with no earlier result", () => {
    const result = scoreOf(without("pagespeed"), { ...ALL_OK, pagespeed: "skipped" });
    expect(lineFor(result, "seo.cwv")).toBe("Speed data is still arriving, so it isn't counted yet.");
  });

  it("says the last speed test is too old when the carried-over one is", () => {
    const result = scoreOf(
      without("pagespeed"),
      { ...ALL_OK, pagespeed: "skipped" },
      { now: NOW, previousPagespeed: { observations: [cwv()], finishedAt: new Date(NOW.getTime() - 15 * DAY_MS) } },
    );
    expect(lineFor(result, "seo.cwv")).toBe(
      "The last speed test is more than two weeks old, so it isn't counted until the next one.",
    );
  });

  it("says there isn't enough history for a trend", () => {
    const scan = [...without("search-console"), ...searchConsole(daysOf(28, 5), daysOf(28, 1))];
    expect(lineFor(scoreOf(scan), "seo.searchTrend")).toBe(
      "There isn't enough search history yet to see a trend.",
    );
  });

  it("falls back to a plain sentence for a reason it doesn't know", () => {
    expect(missingLine("Readiness data has an unexpected shape (robotsTxt: Required)")).toBe(
      "Harbour couldn't measure this in the last check, so it isn't counted.",
    );
  });
});
```

`lib/explain/subscores/seo.test.ts`:

```ts
import { SEO_SUB_SCORES } from "@/lib/scan/scoring/seo";
import type { ScanObservation } from "@/lib/scan/types";
import {
  ACME_SCAN,
  crawlSite,
  cwv,
  daysOf,
  entryOf,
  readiness,
  scoreOf,
  searchConsole,
} from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { SEO_EXPLANATIONS } from "./seo";

function explanation(key: string) {
  const found = SEO_EXPLANATIONS.find((e) => e.key === key);
  if (!found) throw new Error(`No explanation for ${key}`);
  return found;
}

/** The real scorer's evidence for `key`, read back through its explanation. */
const lineOf = (observations: ScanObservation[], key: string) =>
  explanation(key).summarise(entryOf(scoreOf(observations), key)?.evidence ?? "");

/** ACME_SCAN with one collector's observations of `kind` swapped for `replacement`. */
const swap = (collector: string, kind: string, replacement: ScanObservation[]) => [
  ...ACME_SCAN.filter((o) => !(o.collector === collector && o.kind === kind)),
  ...replacement,
];
const withSearch = (current: (number | null)[], prior: (number | null)[]) => [
  ...ACME_SCAN.filter((o) => o.collector !== "search-console"),
  ...searchConsole(current, prior),
];

describe("SEO explanations", () => {
  it("explain every SEO sub-score of the current formula, in formula order and in full", () => {
    expect(SEO_EXPLANATIONS.map((e) => e.key)).toEqual(SEO_SUB_SCORES.map((s) => s.key));
    for (const e of SEO_EXPLANATIONS) {
      expect(e.name.trim()).not.toBe("");
      expect(isComplete(e.parts)).toBe(true);
    }
  });

  it.each([
    [
      "seo.technical",
      "5 of 6 pages Harbour visited loaded properly, and 2 link to a page that's missing.",
    ],
    [
      "seo.indexability",
      "Google is allowed in and your sitemap lists 5 pages; 3 of the 4 Harbour tried loaded properly.",
    ],
    ["seo.cwv", "Google's speed test gives your home page 72 out of 100 on a phone."],
    ["seo.searchTrend", "Google showed your pages 18% more often than in the 28 days before."],
  ])("read %s's real evidence in plain words", (key, line) => {
    expect(lineOf(ACME_SCAN, key)).toBe(line);
  });

  it("say when no page links to a missing one", () => {
    const scan = swap("crawler", "site", [crawlSite({ brokenInternalLinks: [] })]);
    expect(lineOf(scan, "seo.technical")).toBe(
      "5 of 6 pages Harbour visited loaded properly, with no links to missing pages.",
    );
  });

  it("say when robots.txt shuts Google out, or the sitemap is missing", () => {
    const blocked = readiness({
      robotsTxt: { state: "ok", valid: true, googlebot: "blocked", aiCrawlerAccess: null },
    });
    expect(lineOf(swap("readiness", "readiness", [blocked]), "seo.indexability")).toBe(
      "Your robots.txt file tells Google to stay out of your site.",
    );
    const noSitemap = readiness({
      sitemap: {
        reachable: false,
        valid: null,
        sitemapsRead: 0,
        urlCount: null,
        partial: false,
        errors: [],
        offOrigin: [],
        datedUrls: 0,
        newestLastmod: null,
        modifiedLast30Days: 0,
      },
    });
    expect(lineOf(swap("readiness", "readiness", [noSitemap]), "seo.indexability")).toBe(
      "Google is allowed in, but your sitemap is missing or broken.",
    );
  });

  it("fall back to real visitors' wait when there is no lab score", () => {
    const scan = swap("pagespeed", "cwv", [cwv({ performanceScore: null })]);
    expect(lineOf(scan, "seo.cwv")).toBe(
      "Real visitors wait about 260 milliseconds for the page to respond to a tap.",
    );
  });

  it("read a falling, flat or empty search trend", () => {
    expect(lineOf(withSearch(daysOf(28, 40), daysOf(28, 50)), "seo.searchTrend")).toBe(
      "Google showed your pages 20% less often than in the 28 days before.",
    );
    expect(lineOf(withSearch(daysOf(28, 50), daysOf(28, 50)), "seo.searchTrend")).toBe(
      "Google showed your pages about as often as in the 28 days before.",
    );
    expect(lineOf(withSearch(daysOf(28, null), daysOf(28, 50)), "seo.searchTrend")).toBe(
      "Google hasn't shown your pages in search for the last 28 days.",
    );
  });

  it("return null for wording they don't know", () => {
    for (const e of SEO_EXPLANATIONS) expect(e.summarise("Wording from an older formula")).toBeNull();
  });
});
```

`lib/explain/subscores/index.test.ts`:

```ts
import { ACME_SCAN, entryOf, scoreOf } from "@/tests/helpers/scoring";
import { subScoreExplanation, subScoreLine } from ".";

describe("subScoreLine", () => {
  it("reads a measured entry's evidence", () => {
    const technical = entryOf(scoreOf(ACME_SCAN), "seo.technical");
    if (!technical) throw new Error("no seo.technical entry");
    expect(subScoreLine(technical)).toBe(
      "5 of 6 pages Harbour visited loaded properly, and 2 link to a page that's missing.",
    );
  });

  it("reads a missing entry's reason", () => {
    expect(
      subScoreLine({ key: "seo.cwv", score: null, evidence: "PageSpeed is not connected" }),
    ).toBe("Not connected yet, so it isn't counted.");
  });

  // Review Focus 3: stored rows keep the wording and keys of the formula that scored them.
  it("falls back to the verdict's sentence for an older formula's wording or key", () => {
    expect(
      subScoreLine({ key: "seo.technical", score: 64, evidence: "Wording from an older formula" }),
    ).toBe("Working, but there's clear room to improve.");
    expect(subScoreLine({ key: "seo.retired", score: 90, evidence: "anything" })).toBe(
      "Doing really well. Keep it up.",
    );
    expect(subScoreExplanation("seo.retired")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/subscores`
Expected: FAIL — `Failed to resolve import "./missing"`, `"./seo"` and `"."`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/subscores/entry.ts`:

```ts
import type { FourParts } from "../four-parts";

/** A sub-score in plain words: its name, the four parts, and how to read its evidence. */
export type SubScoreExplanation = {
  /** The formula's key, e.g. "seo.technical". */
  key: string;
  name: string;
  parts: FourParts;
  /**
   * A one-line plain reading of the numbers in the stored evidence; null when the evidence does
   * not have the expected wording (an older formula's), so the caller uses the verdict instead.
   */
  summarise: (evidence: string) => string | null;
};

/**
 * The named groups `names` that `pattern` captures in `evidence`, as whole numbers; null unless
 * it matches and every group is one. Evidence is stored text, so it is read defensively.
 */
export function numbersIn<const K extends string>(
  evidence: string,
  pattern: RegExp,
  names: readonly K[],
): Record<K, number> | null {
  const groups = pattern.exec(evidence)?.groups;
  if (!groups) return null;
  const found: Partial<Record<K, number>> = {};
  for (const name of names) {
    const text = groups[name];
    if (text === undefined || !/^\d+$/.test(text)) return null;
    found[name] = Number(text);
  }
  // Every name was filled above, or the function returned null.
  return found as Record<K, number>;
}
```

`lib/explain/subscores/missing.ts`:

```ts
/**
 * Plain words for why a sub-score is missing, keyed on the reasons lib/scan/scoring stores
 * (first match wins).
 */
const REASONS: readonly (readonly [RegExp, string])[] = [
  [/needs? (?:API keys|a rankings API key)/, "Needs paid data, which isn't connected yet, so it isn't counted."],
  [/is not connected/, "Not connected yet, so it isn't counted."],
  [/was skipped and has no earlier result/, "Speed data is still arriving, so it isn't counted yet."],
  [
    /is more than \d+ days old/,
    "The last speed test is more than two weeks old, so it isn't counted until the next one.",
  ],
  [/failed in this scan/, "The data didn't arrive in the last check, so it isn't counted for now."],
  [
    /was skipped in this scan|did not run in this scan/,
    "This wasn't checked last time, so it isn't counted for now.",
  ],
  [
    /^(?:No earlier data|Too little volume|No full baseline)/,
    "There isn't enough search history yet to see a trend.",
  ],
  [
    /^(?:No HTML pages were crawled|The crawl recorded no pages)/,
    "Harbour couldn't read any pages in the last check.",
  ],
  [/robots\.txt could not be read/, "Harbour couldn't read your robots.txt file in the last check."],
];

const UNKNOWN = "Harbour couldn't measure this in the last check, so it isn't counted.";

/** Why a sub-score has no number, in plain words; a reason it doesn't know reads generically. */
export function missingLine(evidence: string): string {
  return REASONS.find(([pattern]) => pattern.test(evidence))?.[1] ?? UNKNOWN;
}
```

`lib/explain/subscores/seo.ts`:

```ts
import { plural } from "@/lib/scan/scoring/sub-score";
import { numbersIn, type SubScoreExplanation } from "./entry";

function technical(evidence: string): string | null {
  const pages = numbersIn(
    evidence,
    /^(?<crawled>\d+) pages crawled, (?<ok>\d+) answered 2xx\./,
    ["crawled", "ok"],
  );
  if (!pages) return null;
  const loaded = `${pages.ok} of ${pages.crawled} ${plural(pages.crawled, "page")} Harbour visited loaded properly`;
  const broken = numbersIn(
    evidence,
    /(?<linking>\d+) of \d+ pages links? to a broken internal page/,
    ["linking"],
  );
  if (!broken) return `${loaded}.`;
  if (broken.linking === 0) return `${loaded}, with no links to missing pages.`;
  return `${loaded}, and ${broken.linking} ${plural(broken.linking, "links", "link")} to a page that's missing.`;
}

function indexability(evidence: string): string | null {
  if (evidence.includes("robots.txt blocks Googlebot")) {
    return "Your robots.txt file tells Google to stay out of your site.";
  }
  const allowed = evidence.includes("Googlebot allowed");
  const sitemap = numbersIn(evidence, /Sitemap valid \((?:at least )?(?<urls>\d+) URLs?\)/, ["urls"]);
  if (sitemap && allowed) {
    const listed = `Google is allowed in and your sitemap lists ${sitemap.urls} ${plural(sitemap.urls, "page")}`;
    const reach = numbersIn(
      evidence,
      /(?<ok>\d+) of (?<crawled>\d+) crawled sitemap URLs answered 2xx/,
      ["ok", "crawled"],
    );
    return reach ? `${listed}; ${reach.ok} of the ${reach.crawled} Harbour tried loaded properly.` : `${listed}.`;
  }
  if (/No sitemap found|Sitemap invalid|Sitemap listed but answers/.test(evidence)) {
    return allowed
      ? "Google is allowed in, but your sitemap is missing or broken."
      : "Your sitemap is missing or broken.";
  }
  return null;
}

function speed(evidence: string): string | null {
  const lab = numbersIn(evidence, /mobile performance (?<score>\d+)/, ["score"]);
  if (lab) return `Google's speed test gives your home page ${lab.score} out of 100 on a phone.`;
  const field = numbersIn(evidence, /field INP (?<ms>\d+) ms/, ["ms"]);
  return field
    ? `Real visitors wait about ${field.ms} milliseconds for the page to respond to a tap.`
    : null;
}

function searchTrend(evidence: string): string | null {
  if (evidence.startsWith("No impressions in the last 28 days")) {
    return "Google hasn't shown your pages in search for the last 28 days.";
  }
  // The scorer writes the change as "(+18.0%)" or, with a real minus sign, "(−20.0%)".
  const change = /\((?<sign>[+−])(?<percent>\d+(?:\.\d+)?)%\)/.exec(evidence)?.groups;
  if (!change?.sign || !change.percent) return null;
  const percent = Math.round(Number(change.percent));
  if (percent === 0) return "Google showed your pages about as often as in the 28 days before.";
  const way = change.sign === "+" ? "more" : "less";
  return `Google showed your pages ${percent}% ${way} often than in the 28 days before.`;
}

/** The SEO sub-scores of the current formula (lib/scan/scoring/seo.ts), in plain words. */
export const SEO_EXPLANATIONS: readonly SubScoreExplanation[] = [
  {
    key: "seo.technical",
    name: "Page health",
    parts: {
      what:
        "Whether your pages load properly and have the basics Google looks for: a clear title, a " +
        "short description, one main heading, a note naming the page's real address (a canonical " +
        "link) and no hidden “don't list me” tag. Links to missing pages count against it.",
      why:
        "Google reads these basics to understand each page and choose what to show in results. " +
        "Missing pieces make a page harder to rank, and links to missing pages waste visitors' time.",
      todo:
        "Work through the matching ideas under Worth doing next: add missing titles and " +
        "descriptions, fix or remove links to missing pages, and keep one main heading per page.",
      worth:
        "Each fix is usually a few minutes' work, and it helps every search that page could turn up in.",
    },
    summarise: technical,
  },
  {
    key: "seo.indexability",
    name: "Google can get in",
    parts: {
      what:
        "Whether Google is allowed to visit your site and can find a list of your pages. Harbour " +
        "checks your robots.txt file (the rules for visiting programs), your sitemap (the list of " +
        "your pages) and whether the pages on that list actually load.",
      why: "If Google is told to stay out, or can't find your pages, they won't show up in search at all.",
      todo:
        "Make sure robots.txt lets Google in, publish a sitemap at the usual address, and take " +
        "out addresses that no longer work.",
      worth: "It's the front door. Once it's right, everything else you do can be found.",
    },
    summarise: indexability,
  },
  {
    key: "seo.cwv",
    name: "Speed on phones",
    parts: {
      what:
        "How quickly your home page loads and responds on a mobile phone, from Google's own speed " +
        "test (PageSpeed) and, where Google has it, the experience of real visitors.",
      why:
        "Google prefers pages that feel quick, and people give up on slow pages before they " +
        "finish loading.",
      todo:
        "Shrink large images, remove scripts you don't need, and look at the slowest parts in the " +
        "PageSpeed report. Your web developer or Claude can help with most of these.",
      worth: "A faster site keeps more of the visitors you already get, as well as helping you rank.",
    },
    summarise: speed,
  },
  {
    key: "seo.searchTrend",
    name: "Showing up more often",
    parts: {
      what:
        "Whether Google showed your pages in search results more or less often in the last 28 " +
        "days than in the 28 days before, from Google Search Console.",
      why:
        "It's the clearest early sign of whether your work is paying off in search, before " +
        "clicks catch up.",
      todo:
        "If it's falling, check which pages and searches dropped in Search Console and freshen " +
        "those pages. If it's rising, keep doing what you're doing.",
      worth:
        "It tells you early whether you're heading the right way, so you can adjust before visits drop.",
    },
    summarise: searchTrend,
  },
];
```

`lib/explain/subscores/index.ts`:

```ts
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { verdictFor } from "../verdict";
import type { SubScoreExplanation } from "./entry";
import { missingLine } from "./missing";
import { SEO_EXPLANATIONS } from "./seo";

export type { SubScoreExplanation } from "./entry";

/** Every sub-score of the current formula in plain words, in formula order. */
export const SUB_SCORE_EXPLANATIONS: readonly SubScoreExplanation[] = [...SEO_EXPLANATIONS];

const BY_KEY = new Map(SUB_SCORE_EXPLANATIONS.map((e) => [e.key, e]));

/** The plain explanation of a sub-score key; null for a key the current formula doesn't have. */
export function subScoreExplanation(key: string): SubScoreExplanation | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * One plain line for a stored breakdown entry: why it is missing, what its evidence says, or —
 * for wording Harbour can't read (an older formula's) — its verdict's sentence.
 */
export function subScoreLine(entry: Pick<ScoreBreakdownEntry, "key" | "score" | "evidence">): string {
  if (entry.score === null) return missingLine(entry.evidence);
  const read = subScoreExplanation(entry.key)?.summarise(entry.evidence) ?? null;
  return read ?? verdictFor(entry.score).sentence;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain && pnpm typecheck && pnpm lint`
Expected: PASS; typecheck and Biome clean (run `pnpm fix` if Biome only reformats long lines, then re-run).

- [ ] **Step 5: Commit**

```bash
git add lib/explain/subscores
git commit -m "$(cat <<'EOF'
feat(explain): plain sub-score lines and the SEO explanations

subScoreLine() reads a breakdown entry's evidence (or its missing reason) in
plain words, falling back to the verdict for older wording. Patterns are
pinned against the real scorer's output.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: GEO sub-score explanations

**Files:**
- Create: `lib/explain/subscores/geo.ts`
- Modify: `lib/explain/subscores/index.ts` (register `GEO_EXPLANATIONS`)
- Test: `lib/explain/subscores/geo.test.ts`

**Interfaces:**
- Consumes: `numbersIn`, `SubScoreExplanation` (Task 3); `plural`.
- Produces: `GEO_EXPLANATIONS: readonly SubScoreExplanation[]` (keys `geo.aiCrawlers`, `geo.llmsTxt`, `geo.entities`, `geo.citations`, `geo.aiEngines`); `SUB_SCORE_EXPLANATIONS` now SEO then GEO.

Acme evidence (verbatim from `lib/scan/scoring/geo.ts`):

```
geo.aiCrawlers  8 of 9 AI crawlers may fetch the home page: 4 of 4 search and retrieval agents, 4 of 5 training crawlers; blocked: GPTBot (training only); some paths disallowed for: CCBot.
geo.llmsTxt     llms.txt present (81 bytes); llms-full.txt not present.
geo.entities    Of 5 HTML pages: 1 declares an Organization or LocalBusiness, 1 the WebSite.
geo.citations   2 of 5 HTML pages have FAQ, HowTo or Article schema or question-style headings (full marks at half the pages).
geo.aiEngines   (always missing) AI engine mention checks not connected (they need API keys).
```

- [ ] **Step 1: Write the failing test**

`lib/explain/subscores/geo.test.ts`:

```ts
import { GEO_SUB_SCORES } from "@/lib/scan/scoring/geo";
import type { ScanObservation } from "@/lib/scan/types";
import { ACME_SCAN, entryOf, readiness, scoreOf } from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { GEO_EXPLANATIONS } from "./geo";

function explanation(key: string) {
  const found = GEO_EXPLANATIONS.find((e) => e.key === key);
  if (!found) throw new Error(`No explanation for ${key}`);
  return found;
}
const lineOf = (observations: ScanObservation[], key: string) =>
  explanation(key).summarise(entryOf(scoreOf(observations), key)?.evidence ?? "");
const withReadiness = (parts: Parameters<typeof readiness>[0]) => [
  ...ACME_SCAN.filter((o) => o.collector !== "readiness"),
  readiness(parts),
];
const schema = (organization: number, website: number) =>
  withReadiness({
    schema: {
      pagesChecked: 5,
      pagesWith: { Organization: organization, WebSite: website, LocalBusiness: 0, FAQPage: 1, HowTo: 1, Article: 0 },
    },
  });

describe("GEO explanations", () => {
  it("explain every GEO sub-score of the current formula, in formula order and in full", () => {
    expect(GEO_EXPLANATIONS.map((e) => e.key)).toEqual(GEO_SUB_SCORES.map((s) => s.key));
    for (const e of GEO_EXPLANATIONS) {
      expect(e.name.trim()).not.toBe("");
      expect(isComplete(e.parts)).toBe(true);
    }
  });

  it.each([
    [
      "geo.aiCrawlers",
      "8 of 9 AI crawlers may read your site, including 4 of the 4 that fetch pages to answer people's questions.",
    ],
    ["geo.llmsTxt", "Your site has an llms.txt guide for AI assistants."],
    ["geo.entities", "Your site tells machines who runs it and what it's called."],
    ["geo.citations", "2 of 5 pages are set out so AI assistants can quote them easily."],
  ])("read %s's real evidence in plain words", (key, line) => {
    expect(lineOf(ACME_SCAN, key)).toBe(line);
  });

  it("say when there is no llms.txt", () => {
    const scan = withReadiness({
      llmsTxt: { present: false, status: 404, bytes: null, truncated: false, error: null },
    });
    expect(lineOf(scan, "geo.llmsTxt")).toBe(
      "Your site doesn't have an llms.txt guide for AI assistants yet.",
    );
  });

  it.each([
    [0, 0, "Your site doesn't yet tell machines who runs it."],
    [1, 0, "Your site says who runs it, but not what the site is called."],
    [0, 1, "Your site gives its name, but not who runs it."],
  ])("read Organization %d and WebSite %d", (organization, website, line) => {
    expect(lineOf(schema(organization, website), "geo.entities")).toBe(line);
  });

  it("never read AI engine mentions, which are always missing for now", () => {
    expect(explanation("geo.aiEngines").summarise("anything")).toBeNull();
  });

  it("return null for wording they don't know", () => {
    for (const e of GEO_EXPLANATIONS) expect(e.summarise("Wording from an older formula")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/subscores/geo.test.ts`
Expected: FAIL — `Failed to resolve import "./geo"`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/subscores/geo.ts`:

```ts
import { numbersIn, type SubScoreExplanation } from "./entry";

function aiCrawlers(evidence: string): string | null {
  const all = numbersIn(
    evidence,
    /^(?<allowed>\d+) of (?<total>\d+) AI crawlers may fetch/,
    ["allowed", "total"],
  );
  if (!all) return null;
  const base = `${all.allowed} of ${all.total} AI crawlers may read your site`;
  const answering = numbersIn(
    evidence,
    /(?<allowed>\d+) of (?<total>\d+) search and retrieval agents?/,
    ["allowed", "total"],
  );
  if (!answering) return `${base}.`;
  return `${base}, including ${answering.allowed} of the ${answering.total} that fetch pages to answer people's questions.`;
}

function llmsTxt(evidence: string): string | null {
  if (evidence.startsWith("llms.txt present")) return "Your site has an llms.txt guide for AI assistants.";
  if (evidence.startsWith("No llms.txt")) {
    return "Your site doesn't have an llms.txt guide for AI assistants yet.";
  }
  return null;
}

function entities(evidence: string): string | null {
  const found = numbersIn(
    evidence,
    /(?<org>\d+) (?:declares|declare) an Organization or LocalBusiness, (?<site>\d+) the WebSite/,
    ["org", "site"],
  );
  if (!found) return null;
  if (found.org > 0 && found.site > 0) return "Your site tells machines who runs it and what it's called.";
  if (found.org > 0) return "Your site says who runs it, but not what the site is called.";
  if (found.site > 0) return "Your site gives its name, but not who runs it.";
  return "Your site doesn't yet tell machines who runs it.";
}

function citations(evidence: string): string | null {
  const found = numbersIn(
    evidence,
    /^(?<ready>\d+) of (?<pages>\d+) HTML pages have FAQ, HowTo or Article schema/,
    ["ready", "pages"],
  );
  return found ? `${found.ready} of ${found.pages} pages are set out so AI assistants can quote them easily.` : null;
}

/** The GEO sub-scores of the current formula (lib/scan/scoring/geo.ts), in plain words. */
export const GEO_EXPLANATIONS: readonly SubScoreExplanation[] = [
  {
    key: "geo.aiCrawlers",
    name: "AI assistants can read your site",
    parts: {
      what:
        "Whether your robots.txt file lets AI crawlers in. These are the programs AI companies " +
        "send to read websites. The ones that fetch pages to answer people's questions count " +
        "three times as much as ones that only collect training data.",
      why: "An assistant can't recommend a page it isn't allowed to read.",
      todo:
        "Allow the crawlers that answer questions, such as OAI-SearchBot, PerplexityBot and " +
        "Claude-SearchBot, in robots.txt. Blocking training-only crawlers is your choice and costs less.",
      worth: "It's often a one-line change that opens your site to every major assistant.",
    },
    summarise: aiCrawlers,
  },
  {
    key: "geo.llmsTxt",
    name: "A guide for AI assistants (llms.txt)",
    parts: {
      what:
        "Whether your site has an llms.txt file: a short plain-text guide at the top level of " +
        "your site that tells AI assistants what you do and which pages matter most.",
      why:
        "It's a simple, growing habit among websites that helps assistants find your best pages quickly.",
      todo:
        "Add a file called llms.txt to the top level of your site with a sentence about your " +
        "business and links to your key pages.",
      worth: "It takes about half an hour and costs nothing to keep up.",
    },
    summarise: llmsTxt,
  },
  {
    key: "geo.entities",
    name: "Says who you are",
    parts: {
      what:
        "Whether your pages carry structured data (labels written for machines) naming the " +
        "business behind the site and the site itself.",
      why: "Assistants need to know who you are before they'll name you. These labels take out the guesswork.",
      todo:
        "Add Organization (or LocalBusiness) and WebSite structured data to your home page. Most " +
        "website builders have a setting or plug-in for it.",
      worth: "It's a one-off change that helps Google and every assistant connect your site to your name.",
    },
    summarise: entities,
  },
  {
    key: "geo.citations",
    name: "Easy for AI to quote",
    parts: {
      what:
        "How many of your pages are set out so they're easy to quote: questions as headings, FAQ " +
        "or how-to sections, or articles marked as articles. Full marks when half your pages are.",
      why:
        "Assistants cite pages that answer a question cleanly. A page that buries the answer in a " +
        "long paragraph gets skipped.",
      todo:
        "On your most important pages, add headings that ask the questions customers ask, with " +
        "the answer straight underneath.",
      worth: "Every page you improve is another chance to be cited.",
    },
    summarise: citations,
  },
  {
    key: "geo.aiEngines",
    name: "Mentioned by AI assistants",
    parts: {
      what:
        "Whether ChatGPT, Perplexity and Gemini actually mention and link to your site when asked " +
        "the questions your customers ask.",
      why: "It's the real result that all the other checks prepare you for.",
      todo:
        "Nothing for now. This needs paid data, which isn't connected yet, so it doesn't count " +
        "towards the score.",
      worth: "Once it's connected, you'll see directly whether assistants recommend you, and for which questions.",
    },
    // Always missing until a paid source is connected: subScoreLine reads its reason instead.
    summarise: () => null,
  },
];
```

In `lib/explain/subscores/index.ts`, add the import and register it:

```ts
import { GEO_EXPLANATIONS } from "./geo";
```

```ts
export const SUB_SCORE_EXPLANATIONS: readonly SubScoreExplanation[] = [
  ...SEO_EXPLANATIONS,
  ...GEO_EXPLANATIONS,
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add lib/explain/subscores/geo.ts lib/explain/subscores/geo.test.ts lib/explain/subscores/index.ts
git commit -m "$(cat <<'EOF'
feat(explain): GEO sub-score explanations

AI crawler access, llms.txt, who-you-are structured data, citation-ready
pages and AI engine mentions, each read from its real evidence.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: AEO sub-score explanations; every formula key covered

**Files:**
- Create: `lib/explain/subscores/aeo.ts`
- Modify: `lib/explain/subscores/index.ts` (register `AEO_EXPLANATIONS`)
- Test: `lib/explain/subscores/aeo.test.ts`; Modify: `lib/explain/subscores/index.test.ts` (completeness)

**Interfaces:**
- Consumes: Task 3/4 exports; `SUB_SCORES` from `@/lib/scan/score` (test only).
- Produces: `AEO_EXPLANATIONS` (keys `aeo.qaCoverage`, `aeo.conciseAnswers`, `aeo.preferredSources`, `aeo.snippets`); `SUB_SCORE_EXPLANATIONS` covers every key of the current formula.

Acme evidence (verbatim from `lib/scan/scoring/aeo.ts`):

```
aeo.qaCoverage        2 of 5 HTML pages have FAQPage, HowTo or QAPage markup (full marks at a quarter of the pages).
aeo.conciseAnswers    4 of 6 question-style headings are answered by a paragraph of at most 60 words right below them.
aeo.preferredSources  Preferred Sources button on 1 page; 4 URLs updated in the last 30 days (fresh content).
aeo.snippets          (always missing) Featured-snippet data not connected (it needs a rankings API key).
```

- [ ] **Step 1: Write the failing tests**

`lib/explain/subscores/aeo.test.ts`:

```ts
import { AEO_SUB_SCORES } from "@/lib/scan/scoring/aeo";
import type { ScanObservation } from "@/lib/scan/types";
import { ACME_SCAN, crawlSite, entryOf, htmlPage, readiness, scoreOf } from "@/tests/helpers/scoring";
import { isComplete } from "../four-parts";
import { AEO_EXPLANATIONS } from "./aeo";

function explanation(key: string) {
  const found = AEO_EXPLANATIONS.find((e) => e.key === key);
  if (!found) throw new Error(`No explanation for ${key}`);
  return found;
}
const lineOf = (observations: ScanObservation[], key: string) =>
  explanation(key).summarise(entryOf(scoreOf(observations), key)?.evidence ?? "");
const otherCollectors = ACME_SCAN.filter((o) => o.collector !== "crawler");

describe("AEO explanations", () => {
  it("explain every AEO sub-score of the current formula, in formula order and in full", () => {
    expect(AEO_EXPLANATIONS.map((e) => e.key)).toEqual(AEO_SUB_SCORES.map((s) => s.key));
    for (const e of AEO_EXPLANATIONS) {
      expect(e.name.trim()).not.toBe("");
      expect(isComplete(e.parts)).toBe(true);
    }
  });

  it.each([
    ["aeo.qaCoverage", "2 of 5 pages are marked up as questions and answers."],
    ["aeo.conciseAnswers", "4 of 6 question headings get a short, direct answer straight underneath."],
    ["aeo.preferredSources", "There's a Preferred Sources button, and 4 pages changed in the last 30 days."],
  ])("read %s's real evidence in plain words", (key, line) => {
    expect(lineOf(ACME_SCAN, key)).toBe(line);
  });

  it("say when no heading asks a question, for one page or several", () => {
    const one = [htmlPage("/"), crawlSite(), ...otherCollectors];
    expect(lineOf(one, "aeo.conciseAnswers")).toBe(
      "Your page doesn't ask a question in a heading yet.",
    );
    const two = [htmlPage("/"), htmlPage("/a"), crawlSite(), ...otherCollectors];
    expect(lineOf(two, "aeo.conciseAnswers")).toBe(
      "None of your 2 pages ask a question in a heading yet.",
    );
  });

  it("say when there is no Preferred Sources button", () => {
    const scan = [
      ...ACME_SCAN.filter((o) => o.collector !== "readiness"),
      readiness({ preferredSources: { button: false, buttonPages: [], freshUrls: 1, freshContent: false } }),
    ];
    expect(lineOf(scan, "aeo.preferredSources")).toBe(
      "There's no Preferred Sources button yet, and 1 page changed in the last 30 days.",
    );
  });

  it("never read featured snippets, which are always missing for now", () => {
    expect(explanation("aeo.snippets").summarise("anything")).toBeNull();
  });

  it("return null for wording they don't know", () => {
    for (const e of AEO_EXPLANATIONS) expect(e.summarise("Wording from an older formula")).toBeNull();
  });
});
```

Append to `lib/explain/subscores/index.test.ts` (and add the imports `SUB_SCORES` from `@/lib/scan/score`, `isComplete` from `../four-parts`, `SUB_SCORE_EXPLANATIONS` from `.`):

```ts
describe("SUB_SCORE_EXPLANATIONS", () => {
  it("explains every sub-score key in the current formula, in order, and nothing else", () => {
    const formula = Object.values(SUB_SCORES)
      .flat()
      .map((spec) => spec.key);
    expect(SUB_SCORE_EXPLANATIONS.map((e) => e.key)).toEqual(formula);
    for (const e of SUB_SCORE_EXPLANATIONS) expect(isComplete(e.parts)).toBe(true);
  });

  it("gives every entry of a real scan a plain line with no codes", () => {
    for (const entry of scoreOf(ACME_SCAN)?.breakdown ?? []) {
      const line = subScoreLine(entry);
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toMatch(/\b(?:seo|geo|aeo)\.|HARBOUR_|\b(?:SEO|GEO|AEO)\b/);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/subscores`
Expected: FAIL — `Failed to resolve import "./aeo"`; the completeness test fails (AEO keys missing).

- [ ] **Step 3: Write minimal implementation**

`lib/explain/subscores/aeo.ts`:

```ts
import { plural } from "@/lib/scan/scoring/sub-score";
import { numbersIn, type SubScoreExplanation } from "./entry";

function qaCoverage(evidence: string): string | null {
  const found = numbersIn(
    evidence,
    /^(?<marked>\d+) of (?<pages>\d+) HTML pages have FAQPage, HowTo or QAPage markup/,
    ["marked", "pages"],
  );
  return found ? `${found.marked} of ${found.pages} pages are marked up as questions and answers.` : null;
}

function conciseAnswers(evidence: string): string | null {
  const none = numbersIn(evidence, /^No question-style headings on (?<pages>\d+) HTML pages/, ["pages"]);
  if (none) {
    return none.pages === 1
      ? "Your page doesn't ask a question in a heading yet."
      : `None of your ${none.pages} pages ask a question in a heading yet.`;
  }
  const found = numbersIn(
    evidence,
    /^(?<answered>\d+) of (?<questions>\d+) question-style headings are answered/,
    ["answered", "questions"],
  );
  return found
    ? `${found.answered} of ${found.questions} question headings get a short, direct answer straight underneath.`
    : null;
}

function preferredSources(evidence: string): string | null {
  const fresh = numbersIn(evidence, /(?<urls>\d+) URLs? updated in the last 30 days/, ["urls"]);
  if (!fresh) return null;
  const changed = `${fresh.urls} ${plural(fresh.urls, "page")} changed in the last 30 days`;
  if (evidence.startsWith("Preferred Sources button on")) {
    return `There's a Preferred Sources button, and ${changed}.`;
  }
  if (evidence.startsWith("No Preferred Sources button")) {
    return `There's no Preferred Sources button yet, and ${changed}.`;
  }
  return null;
}

/** The AEO sub-scores of the current formula (lib/scan/scoring/aeo.ts), in plain words. */
export const AEO_EXPLANATIONS: readonly SubScoreExplanation[] = [
  {
    key: "aeo.qaCoverage",
    name: "Questions and answers marked up",
    parts: {
      what:
        "How many of your pages use FAQ, how-to or Q&A structured data, which tells machines " +
        "“this is a question, and this is its answer”. Full marks when a quarter of your pages do.",
      why: "Marked-up answers are the easiest for Google and AI assistants to lift into their results.",
      todo:
        "Add FAQ structured data to pages that already answer common questions, such as your " +
        "FAQ, pricing or opening-hours pages.",
      worth: "It's quick to do on pages you already have, and it makes those answers stand out.",
    },
    summarise: qaCoverage,
  },
  {
    key: "aeo.conciseAnswers",
    name: "Short, direct answers",
    parts: {
      what:
        "Of the headings on your pages that ask a question, how many are answered straight away " +
        "by a short paragraph of 60 words or fewer.",
      why:
        "Google and AI assistants quote short answers that sit right under the question. Long or " +
        "buried answers get passed over.",
      todo:
        "Under each question heading, start with a two- or three-sentence answer, then add the " +
        "detail after it.",
      worth: "It makes your pages easier for people to read too, not just machines.",
    },
    summarise: conciseAnswers,
  },
  {
    key: "aeo.preferredSources",
    name: "Ready for Preferred Sources",
    parts: {
      what:
        "Two things: whether your site offers Google's Preferred Sources button, which lets " +
        "readers choose to see more of you in Google's news results, and whether you've published " +
        "or updated at least three pages in the last 30 days.",
      why: "Google favours sources that readers have chosen, and fresh pages show the site is looked after.",
      todo:
        "Keep publishing or updating pages regularly. The button mostly matters for news sites, " +
        "and a planned change will stop counting it for other kinds of site.",
      worth: "Regular updates help in every area, and readers who choose you see more of you.",
    },
    summarise: preferredSources,
  },
  {
    key: "aeo.snippets",
    name: "Featured answers on Google",
    parts: {
      what:
        "Whether Google shows your page as the highlighted answer at the top of its results for " +
        "the questions you care about.",
      why: "It's the clearest sign that Google trusts your answer more than anyone else's.",
      todo:
        "Nothing for now. This needs paid rankings data, which isn't connected yet, so it " +
        "doesn't count towards the score.",
      worth: "Once it's connected, you'll see which questions you already win and which are close.",
    },
    // Always missing until a paid source is connected: subScoreLine reads its reason instead.
    summarise: () => null,
  },
];
```

In `lib/explain/subscores/index.ts`:

```ts
import { AEO_EXPLANATIONS } from "./aeo";
```

```ts
export const SUB_SCORE_EXPLANATIONS: readonly SubScoreExplanation[] = [
  ...SEO_EXPLANATIONS,
  ...GEO_EXPLANATIONS,
  ...AEO_EXPLANATIONS,
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain && pnpm typecheck && pnpm lint && pnpm check:files`
Expected: PASS; every file under its limit (largest, `geo.ts`, is about 150 lines).

- [ ] **Step 5: Commit**

```bash
git add lib/explain/subscores
git commit -m "$(cat <<'EOF'
feat(explain): AEO sub-score explanations; every formula key covered

Q&A markup, short answers, Preferred Sources readiness and featured
snippets. A test now fails if a formula key has no complete explanation.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Data sources in plain words

**Files:**
- Create: `lib/explain/sources.ts`
- Test: `lib/explain/sources.test.ts`

**Interfaces:**
- Consumes: `collectorLabel` from `@/lib/scan/labels` (pure); `type CollectorStatus` from `@/lib/scan/types`. Tests read `COLLECTOR_IDS`, `PAID_SOURCES` and `.env.example`.
- Produces: `type SourceState = "connected" | "notConnected" | "failed" | "waiting"`, `type SourceExplanation = { id: string; name: string; gives: string; paid: boolean; connect: readonly string[]; status: Readonly<Record<SourceState, string>> }`, `SOURCES: readonly SourceExplanation[]`, `sourceName(id: string): string`, `sourceStatusPhrase(id: string, status: CollectorStatus | null): string`, `sourceTrouble(failures: readonly { collector: string }[]): string | null`.

- [ ] **Step 1: Write the failing test**

`lib/explain/sources.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { PAID_SOURCES } from "@/lib/costs/paid-sources";
import { COLLECTOR_IDS } from "@/lib/scan/labels";
import { SOURCES, sourceName, sourceStatusPhrase, sourceTrouble } from "./sources";

const ENV_EXAMPLE = readFileSync(".env.example", "utf8");
const SETTING = /HARBOUR_[A-Z_]+/;
const SETTINGS = /HARBOUR_[A-Z_]+/g;

describe("SOURCES", () => {
  it("has an entry for every data source, free and paid, in order", () => {
    expect(SOURCES.map((s) => s.id)).toEqual([...COLLECTOR_IDS, ...PAID_SOURCES.map((p) => p.id)]);
    expect(SOURCES.filter((s) => s.paid).map((s) => s.id)).toEqual(PAID_SOURCES.map((p) => p.id));
  });

  it.each(SOURCES.map((s) => [s.id, s] as const))(
    "gives %s every field, with setting names only in its setup steps",
    (_id, source) => {
      for (const text of [source.name, source.gives, ...Object.values(source.status)]) {
        expect(text.trim()).not.toBe("");
        expect(text).not.toMatch(SETTING);
      }
      expect(source.connect.length).toBeGreaterThan(0);
      for (const setting of source.connect.join(" ").match(SETTINGS) ?? []) {
        expect(ENV_EXAMPLE).toContain(`${setting}=`);
      }
    },
  );

  it("names every setting a paid source needs in its setup steps", () => {
    for (const paid of PAID_SOURCES) {
      const steps = SOURCES.find((s) => s.id === paid.id)?.connect.join(" ") ?? "";
      for (const setting of paid.settings) expect(steps).toContain(setting);
    }
  });
});

describe("source phrases", () => {
  it("say how a source stands after its latest run", () => {
    expect(sourceStatusPhrase("pagespeed", "ok")).toBe("Connected");
    expect(sourceStatusPhrase("pagespeed", "not_configured")).toBe("Not connected yet");
    expect(sourceStatusPhrase("pagespeed", "skipped")).toBe("Runs once a week: waiting for the next run");
    expect(sourceStatusPhrase("search-console", "failed")).toBe(
      "Google didn't send the data in the last check",
    );
    expect(sourceStatusPhrase("crawler", null)).toBe("Runs with the next check");
    expect(sourceStatusPhrase("retired-collector", "failed")).toBe("Had a problem in the last check");
  });

  // Review Focus: one source failing for several products is one problem, named once.
  it("name failing sources once each", () => {
    expect(sourceTrouble([])).toBeNull();
    expect(sourceTrouble([{ collector: "pagespeed" }, { collector: "pagespeed" }])).toBe(
      "Google speed test (PageSpeed) had a problem in the last check",
    );
    expect(sourceTrouble([{ collector: "pagespeed" }, { collector: "crawler" }])).toBe(
      "2 data sources had a problem in the last check",
    );
    expect(sourceName("crawler")).toBe("Page check");
    expect(sourceName("retired-collector")).toBe("retired-collector");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/sources.test.ts`
Expected: FAIL — `Failed to resolve import "./sources"`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/sources.ts`:

```ts
import { collectorLabel } from "@/lib/scan/labels";
import type { CollectorStatus } from "@/lib/scan/types";

export type SourceState = "connected" | "notConnected" | "failed" | "waiting";

/** A data source in plain words. Setting names (HARBOUR_…) appear only in `connect`. */
export type SourceExplanation = {
  /** A collector id (lib/scan/labels) or a paid source id (lib/costs/paid-sources). */
  id: string;
  name: string;
  /** What it gives Harbour, in one sentence. */
  gives: string;
  paid: boolean;
  /** How to connect it, step by step. */
  connect: readonly string[];
  status: Readonly<Record<SourceState, string>>;
};

const BUILT_IN = ["Nothing to set up: it runs with every daily check."];
const RESTART =
  "Restart the worker so it picks up the change: systemctl --user restart harbour-worker.";
const BUILT_IN_STATUS = { connected: "Working", notConnected: "Always on: nothing to connect" };
const PAID_STATUS = {
  connected: "Connected",
  notConnected: "Not available yet",
  failed: "Didn't answer in the last check",
  waiting: "Paused until next month: the monthly budget is used up",
};
const ASKED = "when asked your customers' questions.";

/** Paid sources have no collector yet (lib/costs/paid-sources), so connecting is a later step. */
function paidSteps(settings: string): string[] {
  return [
    "Harbour doesn't collect this data yet.",
    `When it does, you'll add ${settings} to .env, set a monthly budget (HARBOUR_MONTHLY_BUDGET_AUD) and restart the worker.`,
  ];
}

export const SOURCES: readonly SourceExplanation[] = [
  {
    id: "crawler",
    name: "Page check",
    gives: "Visits your site the way Google does and reads each page's title, headings, links and answers.",
    paid: false,
    connect: BUILT_IN,
    status: { ...BUILT_IN_STATUS, failed: "Couldn't read your site in the last check", waiting: "Runs with the next check" },
  },
  {
    id: "readiness",
    name: "Site setup check",
    gives:
      "Reads the files that tell search engines and AI assistants how to treat your site: " +
      "robots.txt, your sitemap, llms.txt and the structured data on your pages.",
    paid: false,
    connect: BUILT_IN,
    status: {
      ...BUILT_IN_STATUS,
      failed: "Couldn't read your site's setup files in the last check",
      waiting: "Runs with the next check",
    },
  },
  {
    id: "pagespeed",
    name: "Google speed test (PageSpeed)",
    gives: "Measures how fast your home page loads and responds on a phone, once a week.",
    paid: false,
    connect: [
      "In the Google Cloud console, enable the PageSpeed Insights API and create a free API key restricted to it.",
      "Add the key to .env as HARBOUR_PAGESPEED_API_KEY.",
      RESTART,
    ],
    status: {
      connected: "Connected",
      notConnected: "Not connected yet",
      failed: "Google's speed test didn't answer in the last check",
      waiting: "Runs once a week: waiting for the next run",
    },
  },
  {
    id: "search-console",
    name: "Google Search Console",
    gives: "Shows how often Google showed your pages in search, which searches found you and how many people clicked.",
    paid: false,
    connect: [
      "Run pnpm gsc:connect on the Harbour machine and sign in with the Google account that can see your sites in Search Console.",
      "Set HARBOUR_GSC_CREDENTIALS in .env to the file it saved.",
      "Give each product its searchConsoleProperty in harbour.config.json.",
      RESTART,
    ],
    status: {
      connected: "Connected",
      notConnected: "Not connected yet",
      failed: "Google didn't send the data in the last check",
      waiting: "Runs with the next check",
    },
  },
  {
    id: "dataforseo",
    name: "Google rankings (DataForSEO)",
    gives: "Where your pages rank on Google for the searches you care about, and which answers Google highlights at the top.",
    paid: true,
    connect: paidSteps("HARBOUR_DATAFORSEO_LOGIN and HARBOUR_DATAFORSEO_PASSWORD"),
    status: PAID_STATUS,
  },
  {
    id: "openai",
    name: "ChatGPT checks (OpenAI)",
    gives: `Whether ChatGPT mentions and links to your sites ${ASKED}`,
    paid: true,
    connect: paidSteps("HARBOUR_OPENAI_API_KEY"),
    status: PAID_STATUS,
  },
  {
    id: "perplexity",
    name: "Perplexity checks",
    gives: `Whether Perplexity mentions and links to your sites ${ASKED}`,
    paid: true,
    connect: paidSteps("HARBOUR_PERPLEXITY_API_KEY"),
    status: PAID_STATUS,
  },
  {
    id: "gemini",
    name: "Gemini checks (Google)",
    gives: `Whether Gemini mentions and links to your sites ${ASKED}`,
    paid: true,
    connect: paidSteps("HARBOUR_GEMINI_API_KEY"),
    status: PAID_STATUS,
  },
];

const BY_ID = new Map(SOURCES.map((source) => [source.id, source]));
/** For a source Harbour no longer knows (an old collector id in stored runs). */
const GENERIC: Readonly<Record<SourceState, string>> = {
  connected: "Working",
  notConnected: "Not connected yet",
  failed: "Had a problem in the last check",
  waiting: "Waiting for the next check",
};
const STATE_OF: Readonly<Record<CollectorStatus, SourceState>> = {
  ok: "connected",
  not_configured: "notConnected",
  failed: "failed",
  skipped: "waiting",
};

/** A data source's plain name; an unknown id falls back to its collector label. */
export function sourceName(id: string): string {
  return BY_ID.get(id)?.name ?? collectorLabel(id);
}

/** How a source stands after its latest run (null: it has not run yet), in plain words. */
export function sourceStatusPhrase(id: string, status: CollectorStatus | null): string {
  const state = status === null ? "waiting" : STATE_OF[status];
  return (BY_ID.get(id)?.status ?? GENERIC)[state];
}

/** One line naming the data sources that failed in the last check; null when none did. */
export function sourceTrouble(failures: readonly { collector: string }[]): string | null {
  const ids = [...new Set(failures.map((f) => f.collector))];
  const [only] = ids;
  if (only === undefined) return null;
  if (ids.length === 1) return `${sourceName(only)} had a problem in the last check`;
  return `${ids.length} data sources had a problem in the last check`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/sources.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS; clean (`pnpm fix` for formatting only).

- [ ] **Step 5: Commit**

```bash
git add lib/explain/sources.ts lib/explain/sources.test.ts
git commit -m "$(cat <<'EOF'
feat(explain): data source names, setup steps and status phrases

Every collector and planned paid source gets a plain name, what it gives
Harbour, how to connect it (setting names only in the steps) and its status
phrases. A test ties the steps to .env.example and the paid-source settings.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Action phrases and who's on it

**Files:**
- Create: `lib/explain/actions.ts`
- Test: `lib/explain/actions.test.ts`
- Modify: `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§3 "Who's on it" rules)

**Interfaces:**
- Consumes: `type ActionActor`, `type ActionStatus` from `@/lib/actions/types`; `type Effort`, `type Impact` from `@/lib/scan/issues`.
- Produces: `IMPACT_PHRASE: Readonly<Record<Impact, string>>`, `EFFORT_PHRASE: Readonly<Record<Effort, string>>`, `STATUS_COLUMN: Readonly<Record<ActionStatus, string>>`, `type WhoOnIt = "claude" | "pr_waiting" | "you" | "undecided"`, `WHO_PHRASE: Readonly<Record<WhoOnIt, string>>`, `type WhoInput = { status: ActionStatus; prUrl: string | null; statusActor: ActionActor | null }`, `whoIsOnIt(input: WhoInput): WhoOnIt | null`.

- [ ] **Step 1: Write the failing test**

`lib/explain/actions.test.ts`:

```ts
import { EFFORT_PHRASE, IMPACT_PHRASE, STATUS_COLUMN, WHO_PHRASE, whoIsOnIt } from "./actions";

describe("action phrases", () => {
  it("use the spec's words for impact, effort and the board's columns", () => {
    expect(IMPACT_PHRASE).toEqual({ high: "Big win", medium: "Worth doing", low: "Small win" });
    expect(EFFORT_PHRASE).toEqual({ small: "quick job", medium: "an afternoon", large: "a project" });
    expect(STATUS_COLUMN).toEqual({
      suggested: "New ideas",
      open: "To do",
      in_progress: "In progress",
      done: "Done",
      snoozed: "Snoozed",
      dismissed: "Dismissed",
    });
  });

  it("word who's on it as the spec does", () => {
    expect(WHO_PHRASE).toEqual({
      claude: "Claude is on it",
      pr_waiting: "Pull request waiting for your OK",
      you: "Waiting for you",
      undecided: "New idea, not decided yet",
    });
  });
});

describe("whoIsOnIt", () => {
  const PR = "https://github.com/example/site/pull/12";
  it.each([
    ["suggested", null, "agent", "undecided"],
    ["suggested", PR, "claude", "undecided"],
    ["open", null, "owner", "you"],
    ["open", null, "scan", "you"],
    ["open", null, "claude", "you"],
    ["open", PR, "claude", "you"],
    ["in_progress", PR, "claude", "pr_waiting"],
    ["in_progress", PR, "owner", "pr_waiting"],
    ["in_progress", null, "claude", "claude"],
    ["in_progress", null, "owner", "you"],
    ["in_progress", null, "system", "you"],
    // Review Focus 1: history pruned to no status change: never "Claude is on it".
    ["in_progress", null, null, "you"],
    ["done", PR, "claude", null],
    ["snoozed", null, "owner", null],
    ["dismissed", null, "claude", null],
  ] as const)("%s, PR %s, last moved by %s → %s", (status, prUrl, statusActor, who) => {
    expect(whoIsOnIt({ status, prUrl, statusActor })).toBe(who);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/actions.ts`:

```ts
import type { ActionActor, ActionStatus } from "@/lib/actions/types";
import type { Effort, Impact } from "@/lib/scan/issues";

export const IMPACT_PHRASE: Readonly<Record<Impact, string>> = {
  high: "Big win",
  medium: "Worth doing",
  low: "Small win",
};

export const EFFORT_PHRASE: Readonly<Record<Effort, string>> = {
  small: "quick job",
  medium: "an afternoon",
  large: "a project",
};

/** The Actions board's column for each status (the stored status values are unchanged). */
export const STATUS_COLUMN: Readonly<Record<ActionStatus, string>> = {
  suggested: "New ideas",
  open: "To do",
  in_progress: "In progress",
  done: "Done",
  snoozed: "Snoozed",
  dismissed: "Dismissed",
};

export type WhoOnIt = "claude" | "pr_waiting" | "you" | "undecided";

export const WHO_PHRASE: Readonly<Record<WhoOnIt, string>> = {
  claude: "Claude is on it",
  pr_waiting: "Pull request waiting for your OK",
  you: "Waiting for you",
  undecided: "New idea, not decided yet",
};

export type WhoInput = {
  status: ActionStatus;
  prUrl: string | null;
  /** Who made the latest status change (creation counts, a PR link does not); null if pruned. */
  statusActor: ActionActor | null;
};

/**
 * Who's on an action (spec §3): a suggestion is undecided; work in progress with a pull request
 * waits for the owner's OK; work Claude started is Claude's; anything else open or in progress
 * waits for the owner. Finished, snoozed and dismissed actions have no one on them.
 */
export function whoIsOnIt({ status, prUrl, statusActor }: WhoInput): WhoOnIt | null {
  if (status === "suggested") return "undecided";
  if (status === "open") return "you";
  if (status !== "in_progress") return null;
  if (prUrl !== null) return "pr_waiting";
  return statusActor === "claude" ? "claude" : "you";
}
```

In the spec, replace the "**Who's on it**" block in §3 with:

```markdown
**Who's on it** (derived from the status, the PR link and who made the latest *status-changing*
event — its creation counts; a PR-link event, which keeps the status, does not):
- "New idea, not decided yet": the action is suggested.
- "Pull request waiting for your OK": it is in progress and has a PR link (whoever started it).
- "Claude is on it": it is in progress, with no PR link, and Claude moved it there.
- "Waiting for you": it is open, or in progress and moved there by anyone else (or by someone
  Harbour no longer knows, after old history was pruned).
- Done, snoozed and dismissed actions show no "who's on it".
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/actions.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/explain/actions.ts lib/explain/actions.test.ts docs/superpowers/specs/2026-10-02-plain-language-ux-design.md
git commit -m "$(cat <<'EOF'
feat(explain): action phrases and who's on it

Big win / quick job wording, the board's column names, and the exact rules
for Claude is on it, Pull request waiting for your OK, Waiting for you and
New idea. Spec §3 now states the rules.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Today's briefing rules

**Files:**
- Create: `lib/explain/briefing.ts`
- Test: `lib/explain/briefing.test.ts`
- Modify: `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§5.1 item 2)

**Interfaces:**
- Consumes: `AREA_ORDER`, `AREAS`, `areaKeyOf` (Task 2); `verdictFor` (Task 1); `sourceTrouble` (Task 6); `type WhoOnIt` (Task 7); `plural`; `type AreaKey`, `type AreaValues` from `@/lib/scan/views`; `type IssueArea`.
- Produces:
  - `type BriefingWork = { productId: string; area: IssueArea; who: WhoOnIt | null }`
  - `type BriefingInput = { products: readonly { id: string; name: string }[]; scores: readonly { productId: string; totals: AreaValues<number | null> }[]; work: readonly BriefingWork[]; failures: readonly { productId: string; collector: string }[] }`
  - `type Briefing = { sentence: string; subLine: string }`
  - `buildBriefing(input: BriefingInput): Briefing`

**Rules (pinned by the tests):**
1. *Health:* the rounded mean of every non-null area total across the products → `verdictFor` band. "Strong/Good/Fair" → "Your sites are in {strong|good|fair} shape."; "Needs work" → "Your sites need some work."; one configured product uses "Your site is …" / "Your site needs …". No total at all → "Harbour has no scores yet, so there's no verdict."
2. *Biggest opportunity:* among (product, area) pairs with a non-null total **and** at least one active action of that product and area, the lowest total; ties keep the earlier product (config order), then the earlier area (Found on Google, Recommended by AI assistants, Answer-ready). Appended as " Biggest opportunity: {area name} for {product name} ({verdict in lower case})." When no pair qualifies, the sentence is the health clause alone.
3. *Sub-line* (" · "-joined): "N things worth doing" (N = active actions; "1 thing worth doing"; 0 → "Nothing on the to-do list"); then "Claude is handling M" when M > 0 (M = actions whose who's-on-it is "Claude is on it"); then `sourceTrouble(failures)` or "nothing is broken".

- [ ] **Step 1: Write the failing test**

`lib/explain/briefing.test.ts`:

```ts
import { type BriefingInput, buildBriefing } from "./briefing";

const PRODUCTS = [
  { id: "acme-docs", name: "Acme Docs" },
  { id: "fern-and-field", name: "Fern & Field" },
];
const totals = (seo: number | null, geo: number | null, aeo: number | null) => ({ seo, geo, aeo });
const input = (over: Partial<BriefingInput>): BriefingInput => ({
  products: PRODUCTS,
  scores: [],
  work: [],
  failures: [],
  ...over,
});

describe("buildBriefing", () => {
  it("healthy: strong scores, nothing to do, nothing broken", () => {
    const briefing = buildBriefing(
      input({
        scores: [
          { productId: "acme-docs", totals: totals(90, 88, 86) },
          { productId: "fern-and-field", totals: totals(92, 85, 95) },
        ],
      }),
    );
    expect(briefing).toEqual({
      sentence: "Your sites are in strong shape.",
      subLine: "Nothing on the to-do list · nothing is broken",
    });
  });

  it("names the lowest-scoring area that has an active action as the biggest opportunity", () => {
    const briefing = buildBriefing(
      input({
        scores: [
          { productId: "acme-docs", totals: totals(72, 40, 66) },
          // Fern & Field's 30 is lower, but nothing is open for it.
          { productId: "fern-and-field", totals: totals(80, 30, 55) },
        ],
        work: [
          { productId: "acme-docs", area: "GEO", who: "you" },
          { productId: "acme-docs", area: "SEO", who: "claude" },
          { productId: "fern-and-field", area: "AEO", who: "pr_waiting" },
        ],
      }),
    );
    expect(briefing).toEqual({
      sentence:
        "Your sites are in fair shape. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).",
      subLine: "3 things worth doing · Claude is handling 1 · nothing is broken",
    });
  });

  it("breaks ties by product order, then area order", () => {
    const briefing = buildBriefing(
      input({
        scores: [
          { productId: "acme-docs", totals: totals(60, 60, 90) },
          { productId: "fern-and-field", totals: totals(60, 90, 90) },
        ],
        work: [
          { productId: "fern-and-field", area: "SEO", who: "you" },
          { productId: "acme-docs", area: "GEO", who: "you" },
          { productId: "acme-docs", area: "SEO", who: "you" },
        ],
      }),
    );
    expect(briefing.sentence).toBe(
      "Your sites are in good shape. Biggest opportunity: Found on Google for Acme Docs (fair).",
    );
  });

  it("skips an area with no score: a gap is never the lowest", () => {
    const briefing = buildBriefing(
      input({
        scores: [{ productId: "acme-docs", totals: totals(null, 75, 60) }],
        work: [
          { productId: "acme-docs", area: "SEO", who: "you" },
          { productId: "acme-docs", area: "GEO", who: "you" },
        ],
      }),
    );
    expect(briefing.sentence).toBe(
      "Your sites are in fair shape. Biggest opportunity: Recommended by AI assistants for Acme Docs (good).",
    );
  });

  it("broken: names the failing data source, once, in the sub-line", () => {
    const one = buildBriefing(
      input({
        scores: [{ productId: "acme-docs", totals: totals(90, 90, 90) }],
        failures: [
          { productId: "acme-docs", collector: "pagespeed" },
          { productId: "fern-and-field", collector: "pagespeed" },
        ],
      }),
    );
    expect(one.subLine).toBe(
      "Nothing on the to-do list · Google speed test (PageSpeed) had a problem in the last check",
    );
    const two = buildBriefing(
      input({
        failures: [
          { productId: "acme-docs", collector: "pagespeed" },
          { productId: "acme-docs", collector: "search-console" },
        ],
      }),
    );
    expect(two.subLine).toBe("Nothing on the to-do list · 2 data sources had a problem in the last check");
  });

  // Review Focus 2: a product scanned with every area missing.
  it("no data: says there is no verdict rather than a bad one", () => {
    const briefing = buildBriefing(
      input({
        scores: [{ productId: "acme-docs", totals: totals(null, null, null) }],
        work: [{ productId: "acme-docs", area: "SEO", who: "you" }],
      }),
    );
    expect(briefing).toEqual({
      sentence: "Harbour has no scores yet, so there's no verdict.",
      subLine: "1 thing worth doing · nothing is broken",
    });
  });

  it("speaks of one site when one product is configured", () => {
    const briefing = buildBriefing({
      products: PRODUCTS.slice(0, 1),
      scores: [{ productId: "acme-docs", totals: totals(30, 40, 20) }],
      work: [],
      failures: [],
    });
    expect(briefing.sentence).toBe("Your site needs some work.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain/briefing.test.ts`
Expected: FAIL — `Failed to resolve import "./briefing"`.

- [ ] **Step 3: Write minimal implementation**

`lib/explain/briefing.ts`:

```ts
import type { IssueArea } from "@/lib/scan/issues";
import { plural } from "@/lib/scan/scoring/sub-score";
import type { AreaKey, AreaValues } from "@/lib/scan/views";
import type { WhoOnIt } from "./actions";
import { AREA_ORDER, AREAS, areaKeyOf } from "./areas";
import { sourceTrouble } from "./sources";
import { verdictFor } from "./verdict";

/** One active (open or in-progress) action, as the briefing counts it. */
export type BriefingWork = { productId: string; area: IssueArea; who: WhoOnIt | null };

export type BriefingInput = {
  /** Configured products in config order: ties go to the earlier one. */
  products: readonly { id: string; name: string }[];
  scores: readonly { productId: string; totals: AreaValues<number | null> }[];
  /** Every active action of those products. */
  work: readonly BriefingWork[];
  /** Data sources that failed in each product's last check. */
  failures: readonly { productId: string; collector: string }[];
};

export type Briefing = { sentence: string; subLine: string };

function health(input: BriefingInput): string {
  const values = input.scores.flatMap(({ totals }) =>
    AREA_ORDER.flatMap((key) => {
      const value = totals[key];
      return value === null ? [] : [value];
    }),
  );
  if (values.length === 0) return "Harbour has no scores yet, so there's no verdict.";
  const mean = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const one = input.products.length === 1;
  const { label } = verdictFor(mean);
  if (label === "Needs work") return one ? "Your site needs some work." : "Your sites need some work.";
  return `${one ? "Your site is" : "Your sites are"} in ${label.toLowerCase()} shape.`;
}

type Opportunity = { productName: string; area: AreaKey; score: number };

function opportunity(input: BriefingInput): string | null {
  let best: Opportunity | null = null;
  for (const product of input.products) {
    const totals = input.scores.find((s) => s.productId === product.id)?.totals;
    if (!totals) continue;
    for (const area of AREA_ORDER) {
      const score = totals[area];
      const active = input.work.some((w) => w.productId === product.id && areaKeyOf(w.area) === area);
      // Strictly lower wins, so a tie keeps the earlier product, then the earlier area.
      if (score !== null && active && (best === null || score < best.score)) {
        best = { productName: product.name, area, score };
      }
    }
  }
  if (best === null) return null;
  const verdict = verdictFor(best.score).label.toLowerCase();
  return `Biggest opportunity: ${AREAS[best.area].name} for ${best.productName} (${verdict}).`;
}

function subLine(input: BriefingInput): string {
  const n = input.work.length;
  const parts = [n === 0 ? "Nothing on the to-do list" : `${n} ${plural(n, "thing")} worth doing`];
  const claude = input.work.filter((w) => w.who === "claude").length;
  if (claude > 0) parts.push(`Claude is handling ${claude}`);
  parts.push(sourceTrouble(input.failures) ?? "nothing is broken");
  return parts.join(" · ");
}

/**
 * Today's briefing, by fixed rules (spec §5.1): overall health is the band of the rounded mean
 * of every area score there is; the biggest opportunity is the lowest-scoring area of any
 * product that has an active action. The sub-line counts active actions, Claude's share and
 * any data source that failed.
 */
export function buildBriefing(input: BriefingInput): Briefing {
  const found = opportunity(input);
  return {
    sentence: found ? `${health(input)} ${found}` : health(input),
    subLine: subLine(input),
  };
}
```

In the spec §5.1, replace item 2 with:

```markdown
2. **Briefing sentence:** overall health plus the single biggest opportunity, chosen by rule.
   Health is the verdict band of the rounded mean of every area score there is ("Your sites are
   in fair shape." / "Your sites need some work."; "Your site …" with one product; "Harbour has
   no scores yet, so there's no verdict." with none). The opportunity is the lowest-scoring area
   (with a score) across products that has an active (open or in-progress) action — ties go to
   the earlier product, then Found on Google → Recommended by AI assistants → Answer-ready —
   written "Biggest opportunity: Answer-ready for Acme Docs (needs work)." and left out when
   none qualifies. Under it, a sub-line: "N things worth doing · Claude is handling M · nothing
   is broken" (M only when Claude is on something; otherwise the failing data source, or "2
   data sources had a problem in the last check").
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/explain && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add lib/explain/briefing.ts lib/explain/briefing.test.ts docs/superpowers/specs/2026-10-02-plain-language-ux-design.md
git commit -m "$(cat <<'EOF'
feat(explain): Today's briefing rules

Overall health from the mean area score, the biggest opportunity as the
lowest-scoring area with an active action, and a sub-line of things worth
doing, Claude's share and what is broken. Spec §5.1 states the rules.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The weekly analyst uses the owner's words

**Files:**
- Modify: `lib/analyst/prompt.ts`
- Test: `lib/analyst/prompt.test.ts`

**Interfaces:**
- Consumes: `AREA_ORDER`, `AREAS` (Task 2); `verdictBandsText` (Task 1).
- Produces: `ANALYST_PROMPT_VERSION = "4-v3"`; the prompt names the areas and verdict bands (spec §4.1).

- [ ] **Step 1: Write the failing test**

In `lib/analyst/prompt.test.ts`, change the version expectation to `expect(ANALYST_PROMPT_VERSION).toBe("4-v3");` and add inside `describe("weeklyAnalystPrompt", …)`:

```ts
  it("uses the owner's words for the areas and the verdict bands", () => {
    expect(prompt).toContain(
      "The three areas are Found on Google (SEO), Recommended by AI assistants (GEO) and Answer-ready (AEO); the data names them by their codes, which belong only in brackets after a name.",
    );
    expect(prompt).toContain(
      "Give each score's verdict before its number: Strong (85 or more), Good (70–84), Fair (50–69), Needs work (under 50).",
    );
    expect(prompt).toContain('A missing score is a gap, never "Needs work".');
    expect(prompt).not.toContain("search (SEO), being cited by AI engines (GEO)");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/analyst/prompt.test.ts`
Expected: FAIL — the version is "4-v2" and the area sentence is missing.

- [ ] **Step 3: Write minimal implementation**

In `lib/analyst/prompt.ts` add imports:

```ts
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import { verdictBandsText } from "@/lib/explain/verdict";
```

bump the version:

```ts
export const ANALYST_PROMPT_VERSION = "4-v3";
```

add a helper above `weeklyAnalystPrompt`:

```ts
/** "Found on Google (SEO), Recommended by AI assistants (GEO) and Answer-ready (AEO)". */
function areaNames(): string {
  const names = AREA_ORDER.map((key) => `${AREAS[key].name} (${AREAS[key].code})`);
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}
```

and replace the opening paragraph of the returned template:

```
You are a careful analyst writing the weekly report for a small business owner who is new to
search (SEO), being cited by AI engines (GEO) and being the answer (AEO). Explain plainly, and
be honest about what the data can and cannot tell.
```

with:

```
You are a careful analyst writing the weekly report for a small business owner who is new to
search and AI assistants. Explain plainly, and be honest about what the data can and cannot tell.

Use the words Harbour shows the owner.
The three areas are ${areaNames()}; the data names them by their codes, which belong only in brackets after a name.
Give each score's verdict before its number: ${verdictBandsText()}.
A missing score is a gap, never "Needs work".
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/analyst lib/agents && pnpm typecheck`
Expected: PASS (the agent spec tests read `ANALYST_PROMPT_VERSION` from the module, not a literal).

- [ ] **Step 5: Commit**

```bash
git add lib/analyst/prompt.ts lib/analyst/prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(analyst): weekly report uses the owner's words

The prompt names Found on Google, Recommended by AI assistants and
Answer-ready, and gives the verdict bands, so reports read like the app.
Prompt version 4-v3.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 10: `<VerdictLine>`

**Files:**
- Create: `components/explain/VerdictLine.tsx`
- Test: `components/explain/VerdictLine.test.tsx`
- Modify: `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§4.2 trend example)

**Interfaces:**
- Consumes: `AREAS` (Task 2), `verdictFor`, `trendPhrase`, `type VerdictTone` (Task 1), `type AreaKey`.
- Produces: `VerdictLine(props: { area: AreaKey; score: number | null; delta?: number | null; complete?: boolean; missingReason?: string; compact?: boolean })` — a server-compatible component (no hooks), rendered as inline `<span>`s so it fits in a table cell or a sentence. Full form: area name, verdict word, small number, trend, "Some data was missing…" note. Compact form (table cell): no area name; an asterisk plus visually hidden "(some data missing)" when incomplete; the trend or the gap reason on its own line.

- [ ] **Step 1: Write the failing test**

`components/explain/VerdictLine.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { VerdictLine } from "./VerdictLine";

describe("VerdictLine", () => {
  it("leads with the area and the verdict, then the number and the trend", () => {
    const { container } = render(<VerdictLine area="seo" score={78} delta={2} />);
    expect(container).toHaveTextContent("Found on Google Good 78 out of 100 up 2 since the last check");
    expect(screen.getByText("Good")).toHaveClass("text-good");
  });

  it.each([
    [92, "Strong", "text-good"],
    [61, "Fair", "text-ink"],
    [34, "Needs work", "text-warn"],
  ])("shows %d as %s in words, never by colour alone", (score, label, tone) => {
    render(<VerdictLine area="geo" score={score} />);
    expect(screen.getByText(label)).toHaveClass(tone);
  });

  it("says steady for no change and leaves the trend out without one", () => {
    const { container, rerender } = render(<VerdictLine area="aeo" score={70} delta={0} />);
    expect(container).toHaveTextContent("Answer-ready Good 70 out of 100 steady");
    rerender(<VerdictLine area="aeo" score={70} />);
    expect(container).not.toHaveTextContent(/steady|since the last check/);
  });

  it("says why a score is missing instead of a verdict", () => {
    const { container } = render(
      <VerdictLine area="aeo" score={null} missingReason="Speed data is still arriving." />,
    );
    expect(container).toHaveTextContent("Answer-ready No score yet Speed data is still arriving.");
    expect(screen.queryByText("Needs work")).toBeNull();
    expect(container).not.toHaveTextContent("out of 100");
  });

  it("notes when some of the data behind a score was missing", () => {
    const { container } = render(<VerdictLine area="geo" score={61} delta={-2} complete={false} />);
    expect(container).toHaveTextContent(
      "Recommended by AI assistants Fair 61 out of 100 down 2 since the last check Some data was missing, so this may change.",
    );
  });

  it("drops the area name in a table cell and marks a partial score with an asterisk", () => {
    const { container } = render(<VerdictLine compact area="geo" score={46} complete={false} />);
    expect(screen.queryByText("Recommended by AI assistants")).toBeNull();
    expect(container).toHaveTextContent("Needs work 46 out of 100* (some data missing)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain/VerdictLine.test.tsx`
Expected: FAIL — `Failed to resolve import "./VerdictLine"`.

- [ ] **Step 3: Write minimal implementation**

`components/explain/VerdictLine.tsx`:

```tsx
import { AREAS } from "@/lib/explain/areas";
import { trendPhrase, type VerdictTone, verdictFor } from "@/lib/explain/verdict";
import type { AreaKey } from "@/lib/scan/views";

/** No red: the word carries the meaning, the tone only supports it. */
const TONE: Readonly<Record<VerdictTone, string>> = {
  strong: "text-good",
  good: "text-good",
  fair: "text-ink",
  weak: "text-warn",
  gap: "text-ink-muted",
};

type Props = {
  area: AreaKey;
  score: number | null;
  /** Change since the last check; null when either check had no number. */
  delta?: number | null;
  /** False when some of the data behind the score was missing. */
  complete?: boolean;
  /** Why there is no score, in plain words (shown instead of a verdict). */
  missingReason?: string;
  /** Table-cell form: no area name (the column header gives it). */
  compact?: boolean;
};

/** A small muted note: on its own line in a table cell, inline otherwise. */
const note = (compact: boolean) => `${compact ? "block " : ""}text-2xs text-ink-muted`;

/** An area's verdict in words first, with the number small beside it and the trend. */
export function VerdictLine({
  area,
  score,
  delta = null,
  complete = true,
  missingReason,
  compact = false,
}: Props) {
  const verdict = verdictFor(score, missingReason);
  const name = compact ? null : (
    <>
      <span className="font-medium text-ink">{AREAS[area].name}</span>{" "}
    </>
  );
  if (score === null || verdict.tone === "gap") {
    return (
      <span className="text-sm">
        {name}
        <span className={TONE.gap}>{verdict.label}</span>{" "}
        <span className={note(compact)}>{verdict.sentence}</span>
      </span>
    );
  }
  const trend = trendPhrase(delta);
  return (
    <span className="text-sm">
      {name}
      <span className={`font-medium ${TONE[verdict.tone]}`}>{verdict.label}</span>{" "}
      <span className="text-xs tabular-nums text-ink-muted">
        {score}
        <span className="sr-only"> out of 100</span>
      </span>
      {compact && !complete && (
        <>
          <span aria-hidden="true" className="text-warn">
            *
          </span>
          <span className="sr-only"> (some data missing)</span>
        </>
      )}
      {trend && (
        <>
          {" "}
          <span className={note(compact)}>{trend}</span>
        </>
      )}
      {!compact && !complete && (
        <>
          {" "}
          <span className={note(false)}>Some data was missing, so this may change.</span>
        </>
      )}
    </span>
  );
}
```

In the spec §4.2, change the `<VerdictLine>` bullet's trend example from `("up 2 this month", "steady")` to `("up 2 since the last check", "steady"; the stored change is against the previous check)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add components/explain/VerdictLine.tsx components/explain/VerdictLine.test.tsx docs/superpowers/specs/2026-10-02-plain-language-ux-design.md
git commit -m "$(cat <<'EOF'
feat(ui): VerdictLine shows the verdict first, the number beside it

Full and compact (table cell) forms, a plain reason for a missing score and a
note when some data was missing. The spec's trend example now matches the
data ("since the last check").

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `<Explainer>`

**Files:**
- Create: `components/explain/Explainer.tsx`
- Test: `components/explain/Explainer.test.tsx`

**Interfaces:**
- Consumes: `type FourParts`, `PART_ORDER`, `PART_LABELS` (Task 1); `AREAS`, `AREA_ORDER` (test).
- Produces: `Explainer(props: { topic: string; oneLiner: string; parts: FourParts; nextStep?: { href: string; label: string } })` — a `"use client"` component. The one-liner is always visible; the button "What's this?" (accessible name "What's this? (topic)") has `aria-expanded` and `aria-controls` and shows a panel with the four parts and the optional next-step link.

- [ ] **Step 1: Write the failing test**

`components/explain/Explainer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import { Explainer } from "./Explainer";

const seo = AREAS.seo;
const BUTTON = "What's this? (Found on Google)";

function renderSeo(nextStep?: { href: string; label: string }) {
  render(
    <Explainer topic={seo.name} oneLiner={seo.oneLiner} parts={seo.parts} nextStep={nextStep} />,
  );
  return screen.getByRole("button", { name: BUTTON });
}

describe("Explainer", () => {
  it("always shows the one-liner and keeps the four parts closed", () => {
    const button = renderSeo();
    expect(screen.getByText(seo.oneLiner)).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel).not.toBeVisible();
  });

  it("opens and closes the four parts from the button", () => {
    const button = renderSeo();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    for (const label of ["What it is", "Why Harbour checks it", "What to do", "Why it's worth it"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByText(seo.parts.worth)).toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(seo.parts.worth)).not.toBeVisible();
  });

  it("is a real button, so it takes focus and Enter or Space work from the keyboard", () => {
    const button = renderSeo();
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    button.focus();
    expect(button).toHaveFocus();
  });

  it("links the next step inside the panel", () => {
    const button = renderSeo({ href: "/actions?area=SEO", label: "See ideas for Found on Google" });
    fireEvent.click(button);
    expect(screen.getByRole("link", { name: "See ideas for Found on Google" })).toHaveAttribute(
      "href",
      "/actions?area=SEO",
    );
  });

  it("gives each explainer on a page its own button name", () => {
    render(
      <>
        {AREA_ORDER.map((key) => (
          <Explainer
            key={key}
            topic={AREAS[key].name}
            oneLiner={AREAS[key].oneLiner}
            parts={AREAS[key].parts}
          />
        ))}
      </>,
    );
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(new Set(names).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain/Explainer.test.tsx`
Expected: FAIL — `Failed to resolve import "./Explainer"`.

- [ ] **Step 3: Write minimal implementation**

`components/explain/Explainer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { type FourParts, PART_LABELS, PART_ORDER } from "@/lib/explain/four-parts";

type Props = {
  /** What it explains, e.g. "Found on Google": names the button for screen readers. */
  topic: string;
  oneLiner: string;
  parts: FourParts;
  /** Where to act on it, e.g. the matching actions. */
  nextStep?: { href: string; label: string };
};

/** One plain sentence, always visible, and a "What's this?" disclosure with the four parts. */
export function Explainer({ topic, oneLiner, parts, nextStep }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-ink">
        <span>{oneLiner}</span>{" "}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((was) => !was)}
          className="rounded-sm text-xs text-accent underline underline-offset-2"
        >
          What's this?<span className="sr-only"> ({topic})</span>
        </button>
      </p>
      <div id={panelId} hidden={!open} className="rounded-md bg-surface-sunk p-3">
        <dl className="flex flex-col gap-2">
          {PART_ORDER.map((part) => (
            <div key={part}>
              <dt className="text-xs font-medium text-ink">{PART_LABELS[part]}</dt>
              <dd className="text-sm text-ink-muted">{parts[part]}</dd>
            </div>
          ))}
        </dl>
        {nextStep && (
          <p className="mt-3 text-sm">
            <Link href={nextStep.href} className="rounded-sm text-accent underline underline-offset-2">
              {nextStep.label}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add components/explain/Explainer.tsx components/explain/Explainer.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): Explainer, a one-liner with a "What's this?" disclosure

The button reports aria-expanded, names its topic for screen readers and
reveals the four parts with an optional next-step link.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `<TechnicalDetails>`

**Files:**
- Create: `components/explain/TechnicalDetails.tsx`
- Test: `components/explain/TechnicalDetails.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `TechnicalDetails(props: { id: string; topic: string; children: ReactNode })` — a `"use client"` native `<details>`, closed by default, summary "Technical details" (accessible text "Technical details (topic)"). The owner's choice is stored under `localStorage["harbour:technical-details:<id>"]` as `"open"` / `"closed"`; reading and writing are wrapped in try/catch and never required.

- [ ] **Step 1: Write the failing test**

`components/explain/TechnicalDetails.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { TechnicalDetails } from "./TechnicalDetails";

const KEY = "harbour:technical-details:example";

const example = () => (
  <TechnicalDetails id="example" topic="example scores">
    <p>seo.technical · weight 0.35</p>
  </TechnicalDetails>
);

function detailsElement(): HTMLDetailsElement {
  const details = screen.getByText(/^Technical details/).closest("details");
  if (!details) throw new Error("no <details>");
  return details;
}

/** What a click on the summary does: the browser flips `open`, then fires "toggle". */
function toggle(open: boolean) {
  const details = detailsElement();
  details.open = open;
  fireEvent(details, new Event("toggle"));
}

describe("TechnicalDetails", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is closed by default, with a summary that names its topic", () => {
    render(example());
    expect(detailsElement().open).toBe(false);
    expect(detailsElement().querySelector("summary")).toHaveTextContent(
      "Technical details (example scores)",
    );
    expect(screen.getByText("seo.technical · weight 0.35")).not.toBeVisible();
  });

  it("remembers the owner's choice for the next visit", () => {
    const { unmount } = render(example());
    toggle(true);
    expect(localStorage.getItem(KEY)).toBe("open");
    unmount();
    render(example());
    expect(detailsElement().open).toBe(true);
    toggle(false);
    expect(localStorage.getItem(KEY)).toBe("closed");
  });

  it("keeps each section's choice apart", () => {
    localStorage.setItem("harbour:technical-details:other", "open");
    render(example());
    expect(detailsElement().open).toBe(false);
  });

  // Review Focus 4: storage can be blocked (private mode, policy).
  it("still opens and closes when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(example());
    expect(detailsElement().open).toBe(false);
    toggle(true);
    expect(detailsElement().open).toBe(true);
    expect(screen.getByText("seo.technical · weight 0.35")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain/TechnicalDetails.test.tsx`
Expected: FAIL — `Failed to resolve import "./TechnicalDetails"`.

- [ ] **Step 3: Write minimal implementation**

`components/explain/TechnicalDetails.tsx`:

```tsx
"use client";

import { type ReactNode, useEffect, useState } from "react";

const KEY_PREFIX = "harbour:technical-details:";

function readChoice(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "open";
  } catch {
    // Storage can be blocked (private mode, policy); the section then starts closed, as always.
    return false;
  }
}

function saveChoice(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // Remembering is only a convenience: without storage the section still opens and closes.
  }
}

type Props = {
  /** Stable per section: the owner's open/closed choice is remembered under it. */
  id: string;
  /** What is inside, e.g. "scores in numbers": names the summary for screen readers. */
  topic: string;
  children: ReactNode;
};

/** Raw evidence, codes and formulas: closed by default, remembering the owner's choice. */
export function TechnicalDetails({ id, topic, children }: Props) {
  const key = `${KEY_PREFIX}${id}`;
  const [open, setOpen] = useState(false);
  // After mount only: the server render (and a first visit) is always closed.
  useEffect(() => {
    if (readChoice(key)) setOpen(true);
  }, [key]);
  return (
    <details
      open={open}
      onToggle={(event) => {
        const now = event.currentTarget.open;
        setOpen(now);
        saveChoice(key, now);
      }}
      className="text-xs"
    >
      <summary className="w-fit cursor-pointer rounded-sm text-ink-muted hover:text-ink">
        Technical details<span className="sr-only"> ({topic})</span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add components/explain/TechnicalDetails.tsx components/explain/TechnicalDetails.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TechnicalDetails keeps codes one click away

A native details element, closed by default, that remembers the owner's
choice per section when storage allows and works without it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `<EmptyState>`

**Files:**
- Create: `components/explain/EmptyState.tsx`
- Test: `components/explain/EmptyState.test.tsx`

**Interfaces:**
- Produces: `EmptyState(props: { what: string; when: string; why: string })` — says what will appear here, when, and why.

- [ ] **Step 1: Write the failing test**

`components/explain/EmptyState.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says what will appear, when and why", () => {
    const { container } = render(
      <EmptyState
        what="Nothing to do right now."
        when="New ideas appear here after each daily check and each weekly report."
        why="Harbour only suggests a change when a check finds something worth fixing."
      />,
    );
    expect(screen.getByText("Nothing to do right now.")).toBeVisible();
    expect(container).toHaveTextContent(
      "Nothing to do right now. New ideas appear here after each daily check and each weekly report. Harbour only suggests a change when a check finds something worth fixing.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain/EmptyState.test.tsx`
Expected: FAIL — `Failed to resolve import "./EmptyState"`.

- [ ] **Step 3: Write minimal implementation**

`components/explain/EmptyState.tsx`:

```tsx
type Props = {
  /** What will appear here. */
  what: string;
  /** When it will appear. */
  when: string;
  /** Why it is empty, or why it matters. */
  why: string;
};

/** An empty place that says what will appear, when and why: never a bare "nothing here". */
export function EmptyState({ what, when, why }: Props) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-3 text-sm">
      <p className="text-ink">{what}</p>
      <p className="mt-1 text-ink-muted">
        {when} {why}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/explain && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/explain/EmptyState.tsx components/explain/EmptyState.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): EmptyState says what will appear, when and why

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Plain-language examples on `/design`; the AGENTS.md rule

**Files:**
- Create: `components/design/Example.tsx`
- Create: `components/design/ExplainExamples.tsx`
- Test: `components/design/ExplainExamples.test.tsx`
- Modify: `components/design/OpsExamples.tsx` (use the shared `Example`)
- Modify: `app/(app)/design/page.tsx`
- Modify: `tests/e2e/shell.spec.ts` (design test, both themes)
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Tasks 2–13.
- Produces: `Example(props: { label: string; children: ReactNode })`; `ExplainExamples()` (no props); a "Plain-language examples" section on `/design`.

- [ ] **Step 1: Write the failing tests**

`components/design/ExplainExamples.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ExplainExamples } from "./ExplainExamples";

describe("ExplainExamples", () => {
  it("shows every plain-language component, nested under the design page's heading", () => {
    render(<ExplainExamples />);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    for (const label of ["Strong", "Good", "Fair", "No score yet"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Needs work").length).toBeGreaterThan(0);
    expect(screen.getByText(/^Technical details/)).toBeInTheDocument();
    expect(screen.getByText("Nothing to do right now.")).toBeInTheDocument();
  });

  it("gives each What's this? button its own accessible name", () => {
    render(<ExplainExamples />);
    const names = screen
      .getAllByRole("button", { name: /^What's this\?/ })
      .map((button) => button.textContent);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });
});
```

In `tests/e2e/shell.spec.ts`, add imports:

```ts
import { AREAS } from "@/lib/explain/areas";
import { hydrated } from "./hydration";
```

and replace the light/dark `"design system page renders every section"` test body with:

```ts
    test("design system page renders every section", async ({ page }) => {
      const cspErrors = watchCspErrors(page);
      await page.goto("/design");
      for (const name of ["Colour tokens", "Type", "Components", "Plain-language examples"]) {
        await expect(page.getByRole("heading", { name })).toBeVisible();
      }
      const whatsThis = page.getByRole("button", {
        name: "What's this? (Recommended by AI assistants example)",
      });
      await hydrated(whatsThis);
      await whatsThis.click();
      await expect(whatsThis).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByText(AREAS.geo.parts.worth)).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(cspErrors).toEqual([]);
    });
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/design/ExplainExamples.test.tsx`
Expected: FAIL — `Failed to resolve import "./ExplainExamples"`.

- [ ] **Step 3: Write minimal implementation**

`components/design/Example.tsx`:

```tsx
import type { ReactNode } from "react";

/** A labelled example on /design. */
export function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xs uppercase tracking-widest text-ink-muted">{label}</p>
      {children}
    </div>
  );
}
```

In `components/design/OpsExamples.tsx`, delete the local `function Example(…)` and the `import type { ReactNode } from "react";` line, and add `import { Example } from "./Example";`.

`components/design/ExplainExamples.tsx`:

```tsx
import { EmptyState } from "@/components/explain/EmptyState";
import { Explainer } from "@/components/explain/Explainer";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { VerdictLine } from "@/components/explain/VerdictLine";
import { AREAS } from "@/lib/explain/areas";
import { subScoreExplanation, subScoreLine } from "@/lib/explain/subscores";
import { GAP_REASONS } from "@/lib/explain/verdict";
import { Example } from "./Example";

/** A fictional breakdown entry, worded as the scorer words it. */
const CONCISE = {
  key: "aeo.conciseAnswers",
  score: 67,
  evidence:
    "4 of 6 question-style headings are answered by a paragraph of at most 60 words right below them.",
};

/** Fictional verdicts and explanations: every plain-language component in its main states. */
export function ExplainExamples() {
  const concise = subScoreExplanation(CONCISE.key);
  const geo = AREAS.geo;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">Illustrative verdicts and explanations.</p>
      <Example label="Verdict line · each band, a gap and a partial score">
        <div className="flex flex-col gap-1">
          <VerdictLine area="seo" score={92} delta={3} />
          <VerdictLine area="geo" score={78} delta={0} />
          <VerdictLine area="aeo" score={61} delta={-2} complete={false} />
          <VerdictLine area="seo" score={34} />
          <VerdictLine area="geo" score={null} missingReason="Speed data is still arriving." />
        </div>
      </Example>
      <Example label="Verdict line · compact, as in a table cell">
        <div className="flex flex-wrap gap-6">
          <VerdictLine compact area="seo" score={78} delta={2} />
          <VerdictLine compact area="geo" score={46} complete={false} />
          <VerdictLine compact area="aeo" score={null} missingReason={GAP_REASONS.notChecked} />
        </div>
      </Example>
      <Example label="Explainer · an area, with a next step">
        <Explainer
          topic={`${geo.name} example`}
          oneLiner={geo.oneLiner}
          parts={geo.parts}
          nextStep={{ href: "/actions?area=GEO", label: `See ideas for ${geo.name}` }}
        />
      </Example>
      {concise && (
        <Example label="Explainer · a sub-score, read from its evidence">
          <p className="text-sm font-medium">{concise.name}</p>
          <Explainer
            topic={`${concise.name} example`}
            oneLiner={subScoreLine(CONCISE)}
            parts={concise.parts}
          />
        </Example>
      )}
      <Example label="Technical details · closed by default">
        <TechnicalDetails id="design-example" topic="example evidence">
          <p className="font-mono">
            {CONCISE.key} · weight 0.35 · {CONCISE.evidence}
          </p>
        </TechnicalDetails>
      </Example>
      <Example label="Empty state">
        <EmptyState
          what="Nothing to do right now."
          when="New ideas appear here after each daily check and each weekly report."
          why="Harbour only suggests a change when a check finds something worth fixing."
        />
      </Example>
    </div>
  );
}
```

In `app/(app)/design/page.tsx` add `import { ExplainExamples } from "@/components/design/ExplainExamples";` and, right after the `<Section title="Components">…</Section>` block:

```tsx
      <Section title="Plain-language examples">
        <ExplainExamples />
      </Section>
```

In `AGENTS.md`, under `## Design system`, append this bullet after the accessibility bullet:

```markdown
- **Plain language** (`docs/superpowers/specs/2026-10-02-plain-language-ux-design.md`): lead
  with a verdict or a plain sentence and keep the number small beside it; keep one line always
  visible and the rest behind "What's this?" (`<Explainer>`); put codes (SEO/GEO/AEO,
  sub-score keys, `HARBOUR_*` names, raw errors) only inside `<TechnicalDetails>` or setup
  steps. Area names, verdicts, sub-score, data-source and action wording come from
  `lib/explain/` — never a second copy in a component. Every message says what happened,
  whether it matters and what to do.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/design && pnpm typecheck && pnpm lint && pnpm check:files`
Expected: PASS (the existing `OpsExamples` tests still pass with the shared `Example`). The e2e change runs in Task 20's full e2e run; to check it now: `source ~/.nvm/nvm.sh && pnpm test:e2e --project chromium -g "design system page"`.

- [ ] **Step 5: Commit**

```bash
git add components/design/Example.tsx components/design/ExplainExamples.tsx components/design/ExplainExamples.test.tsx components/design/OpsExamples.tsx "app/(app)/design/page.tsx" tests/e2e/shell.spec.ts AGENTS.md
git commit -m "$(cat <<'EOF'
feat(design): plain-language examples on /design; AGENTS plain-language rule

VerdictLine, Explainer, TechnicalDetails and EmptyState in their main states,
checked in light and dark. The labelled example wrapper is shared. AGENTS.md
points new UI at lib/explain and the spec.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Step 2 — Today

### Task 15: Active work, with who last changed each action's status

**Files:**
- Create: `lib/actions/active-work.ts`
- Test: `lib/actions/active-work.test.ts`

**Interfaces:**
- Consumes: `actions` table, `ACTIVE`, `type ActionActor`, `type ActionRow` (`lib/actions/types.ts`). Tests use `insertAction`, `setStatus`, `MAX_ACTION_EVENTS` (`lib/actions/store.ts`), `linkPullRequest` (`lib/actions/pr-link.ts`), `ruleAction` (`tests/helpers/actions.ts`), `openTestDb`.
- Produces: `type ActiveWork = Pick<ActionRow, "id" | "productId" | "area" | "prUrl"> & { status: "open" | "in_progress"; statusActor: ActionActor | null }`, `activeWork(db: Db, productIds: readonly string[]): ActiveWork[]` (oldest first). `ActiveWork` satisfies `WhoInput` (Task 7).

- [ ] **Step 1: Write the failing test**

`lib/actions/active-work.test.ts`:

```ts
import type { Db } from "@/lib/db/client";
import { ruleAction } from "@/tests/helpers/actions";
import { openTestDb } from "@/tests/helpers/db";
import { activeWork } from "./active-work";
import { linkPullRequest } from "./pr-link";
import { insertAction, MAX_ACTION_EVENTS, setStatus } from "./store";
import type { NewAction } from "./types";

const PRODUCTS = ["acme-docs", "acme-shop"];
const t0 = new Date("2026-10-02T09:00:00Z");
let minute = 0;
const at = () => new Date(t0.getTime() + ++minute * 60_000);
const add = (db: Db, over: Partial<NewAction>) =>
  insertAction(db, ruleAction({ ruleKey: `rule-${minute}`, ...over }), "scan", null, at());
const pr = (n: number) => `https://github.com/example/site/pull/${n}`;

describe("activeWork", () => {
  beforeEach(() => {
    minute = 0;
  });

  it("lists open and in-progress actions of configured products with who last moved them", () => {
    const db = openTestDb();
    const open = add(db, { title: "open" });
    const started = add(db, { title: "started" });
    setStatus(db, started, "open", "in_progress", { actor: "owner", now: at() });
    const claude = add(db, { title: "claude", area: "GEO", productId: "acme-shop" });
    setStatus(db, claude, "open", "in_progress", { actor: "claude", note: "Adding llms.txt", now: at() });
    add(db, { title: "done", status: "done" });
    add(db, { title: "snoozed", status: "snoozed", snoozedUntil: "2026-10-09" });
    add(db, { title: "elsewhere", productId: "retired-product" });
    expect(activeWork(db, PRODUCTS)).toEqual([
      { id: open, productId: "acme-docs", area: "SEO", status: "open", prUrl: null, statusActor: "scan" },
      { id: started, productId: "acme-docs", area: "SEO", status: "in_progress", prUrl: null, statusActor: "owner" },
      { id: claude, productId: "acme-shop", area: "GEO", status: "in_progress", prUrl: null, statusActor: "claude" },
    ]);
    expect(activeWork(db, [])).toEqual([]);
  });

  // Regression: a PR link is an event from a status to itself, and each action must read its
  // own events (Drizzle's unqualified subquery columns would correlate on the wrong id).
  it("ignores a pull request link when finding who moved the status last", () => {
    const db = openTestDb();
    const mine = add(db, { title: "mine" });
    setStatus(db, mine, "open", "in_progress", { actor: "owner", now: at() });
    const claudes = add(db, { title: "claude's" });
    setStatus(db, claudes, "open", "in_progress", { actor: "claude", note: "On it", now: at() });
    const linked = linkPullRequest(db, { id: mine, url: pr(7), productIds: PRODUCTS, now: at() });
    expect(linked).toMatchObject({ ok: true });
    expect(activeWork(db, PRODUCTS).map((w) => [w.id, w.statusActor, w.prUrl])).toEqual([
      [mine, "owner", pr(7)],
      [claudes, "claude", null],
    ]);
  });

  // Review Focus 1: only the newest MAX_ACTION_EVENTS events are kept.
  it("has no actor once pruning removed every status change", () => {
    const db = openTestDb();
    const id = add(db, { title: "busy" });
    setStatus(db, id, "open", "in_progress", { actor: "claude", note: "On it", now: at() });
    for (let i = 1; i <= MAX_ACTION_EVENTS / 2; i++) {
      linkPullRequest(db, { id, url: pr(i), productIds: PRODUCTS, now: at() });
      linkPullRequest(db, { id, url: null, productIds: PRODUCTS, now: at() });
    }
    expect(activeWork(db, PRODUCTS)).toEqual([
      { id, productId: "acme-docs", area: "SEO", status: "in_progress", prUrl: null, statusActor: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/actions/active-work.test.ts`
Expected: FAIL — `Failed to resolve import "./active-work"`.

- [ ] **Step 3: Write minimal implementation**

`lib/actions/active-work.ts`:

```ts
import { and, asc, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { actions } from "@/lib/db/schema";
import { ACTIVE, type ActionActor, type ActionRow } from "./types";

const ACTORS: readonly ActionActor[] = ["owner", "claude", "scan", "agent", "system"];
const isActor = (value: unknown): value is ActionActor =>
  typeof value === "string" && (ACTORS as readonly string[]).includes(value);

/**
 * Who made the action's latest status change: its creation counts, a PR link (an event from a
 * status to itself) does not. Raw SQL on purpose: Drizzle renders columns unqualified inside a
 * subquery, so `${actions.id}` would bind to action_events.id instead of the outer action.
 */
const statusActor = sql<string | null>`(
  SELECT e.actor FROM action_events AS e
  WHERE e.action_id = "actions"."id"
    AND (e.from_status IS NULL OR e.from_status <> e.to_status)
  ORDER BY e.id DESC LIMIT 1
)`;

/** An active action as Today counts it. */
export type ActiveWork = Pick<ActionRow, "id" | "productId" | "area" | "prUrl"> & {
  status: "open" | "in_progress";
  /** Null when pruning removed every status change: unknown, never guessed. */
  statusActor: ActionActor | null;
};

/** Every open or in-progress action of the configured products, oldest first, with who last moved it. */
export function activeWork(db: Db, productIds: readonly string[]): ActiveWork[] {
  if (productIds.length === 0) return [];
  const rows = db
    .select({
      id: actions.id,
      productId: actions.productId,
      area: actions.area,
      status: actions.status,
      prUrl: actions.prUrl,
      statusActor,
    })
    .from(actions)
    .where(and(inArray(actions.productId, [...productIds]), inArray(actions.status, [...ACTIVE])))
    .orderBy(asc(actions.id))
    .all();
  return rows.flatMap((row) =>
    row.status === "open" || row.status === "in_progress"
      ? [{ ...row, status: row.status, statusActor: isActor(row.statusActor) ? row.statusActor : null }]
      : [],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/actions && pnpm typecheck && pnpm lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/active-work.ts lib/actions/active-work.test.ts
git commit -m "$(cat <<'EOF'
feat(actions): active work with who last changed each action's status

One query lists open and in-progress actions with the actor of their latest
status change (PR links don't count), for Today's "who's on it". A
regression test pins the subquery's correlation.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Today's briefing sentence and sub-line

**Files:**
- Modify: `lib/today/types.ts`, `lib/today/from-actions.ts`, `lib/today/from-scans.ts`, `lib/today/sample.ts`
- Modify: `lib/actions/views.ts` (delete `activeImpactCounts`, now unused), `lib/actions/views.test.ts`
- Create: `components/today/BriefingText.tsx`
- Modify: `components/today/TodayHeader.tsx`, `components/today/TodayView.tsx`
- Test: `lib/today/from-actions.test.ts`, `lib/today/from-scans.test.ts`, `lib/today/sample.test.ts`, `components/today/TodayView.test.tsx`
- Modify: `tests/e2e/shell.spec.ts`, `tests/e2e/scans.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `buildBriefing`, `type Briefing`, `type BriefingWork` (Task 8); `whoIsOnIt` (Task 7); `activeWork` (Task 15); `Tag`.
- Produces:
  - `TodaySummary.briefing: Briefing` replaces `TodaySummary.headline: string`.
  - `attentionFromActions(db, productIds): { actions: ActionPreview[]; more: number; work: BriefingWork[] }` (`headlineImpacts` removed).
  - `sampleToday(products: readonly Product[], failures: readonly SourceFailure[] = []): TodaySummary`.
  - `BriefingText(props: { briefing: Briefing; isSample: boolean; level?: 1 | 3 })` — the sentence as `<h1>` (Today) or `<h3>` (/design), a "Sample" tag above it on sample data, the sub-line under it.
  - `TodayHeader(props: { now; timeZone; locale; scannedAt; scanning; lastFailedAt; briefing: Briefing; isSample: boolean })`.
  - `headlineFor` is deleted.

- [ ] **Step 1: Write the failing tests**

`lib/today/from-actions.test.ts` — add `import { linkPullRequest } from "@/lib/actions/pr-link";` and `import { setStatus } from "@/lib/actions/store";`; in the first test replace `expect(result.headlineImpacts).toEqual(["high", "high", "medium", "low"]);` with:

```ts
    expect(result.work).toEqual([
      { productId: "acme-docs", area: "SEO", who: "you" },
      { productId: "acme-docs", area: "SEO", who: "you" },
      { productId: "acme-docs", area: "SEO", who: "you" },
      { productId: "acme-shop", area: "SEO", who: "you" },
    ]);
```

in the second replace `expect(result.headlineImpacts).toEqual(["low"]);` with `expect(result.work).toEqual([{ productId: "acme-docs", area: "SEO", who: "you" }]);`, in the third replace both `headlineImpacts: []` with `work: []`, and add:

```ts
  it("says Claude is on what Claude started, and that a pull request waits for the owner", () => {
    const db = openTestDb();
    const claude = add(db, { title: "claude", area: "GEO" });
    setStatus(db, claude, "open", "in_progress", { actor: "claude", note: "Adding llms.txt", now: t0 });
    const pr = add(db, { title: "pr", area: "AEO" });
    setStatus(db, pr, "open", "in_progress", { actor: "claude", note: "Opened a PR", now: t0 });
    linkPullRequest(db, {
      id: pr,
      url: "https://github.com/example/site/pull/3",
      productIds: [...PRODUCTS],
      now: t0,
    });
    expect(attentionFromActions(db, PRODUCTS).work).toEqual([
      { productId: "acme-docs", area: "GEO", who: "claude" },
      { productId: "acme-docs", area: "AEO", who: "pr_waiting" },
    ]);
  });
```

`lib/today/from-scans.test.ts` — change the import to `import { todaySummary } from "./from-scans";`, delete the whole `describe("headlineFor", …)` block, and:
- in "keeps the sample's actions…", replace `expect(today.headline).toBe(sample.headline);` with `expect(today.briefing).toEqual(sample.briefing);`
- in "before any scores, says the last scan failed…", append:

```ts
    expect(todaySummary(db, products, T0).briefing.subLine).toBe(
      "2 things worth doing · Page check had a problem in the last check",
    );
```

- in "summarises real scores…", replace `expect(today.headline).toBe("Calm waters. Nothing needs your attention.");` with:

```ts
    expect(today.briefing).toEqual({
      sentence: "Your sites need some work.",
      subLine:
        "Nothing on the to-do list · Google speed test (PageSpeed) had a problem in the last check",
    });
```

- rename "counts active actions in the headline and shows the top three" to "briefs on the active actions and shows the top three" and replace `expect(today.headline).toBe("Four things worth your attention.");` with:

```ts
    expect(today.briefing).toEqual({
      sentence:
        "Your sites need some work. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).",
      subLine: "4 things worth doing · nothing is broken",
    });
```

`lib/today/sample.test.ts` — add:

```ts
  it("briefs from its own sample scores and actions, and from real source failures", () => {
    expect(sampleToday(products).briefing).toEqual({
      sentence:
        "Your sites need some work. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).",
      subLine: "2 things worth doing · nothing is broken",
    });
    const failing = sampleToday(products, [
      { productId: "acme-docs", collector: "crawler", error: "Could not crawl" },
    ]);
    expect(failing.failures).toHaveLength(1);
    expect(failing.briefing.subLine).toBe(
      "2 things worth doing · Page check had a problem in the last check",
    );
  });
```

`components/today/TodayView.test.tsx` — in the `real` fixture replace `headline: "One thing worth your attention.",` with:

```ts
  briefing: {
    sentence: "Your site is in fair shape. Biggest opportunity: Found on Google for Acme Docs (fair).",
    subLine: "1 thing worth doing · Google speed test (PageSpeed) had a problem in the last check",
  },
```

and update these tests:

```ts
  it("before any scan shows the sample, flagged, with unlinked sample actions", () => {
    const sample = sampleToday(getProducts());
    renderToday(sample);
    expect(screen.getByRole("note")).toHaveTextContent(/Sample data/);
    expect(screen.getByText("Sample", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sample.briefing.sentence);
    expect(screen.getByText(/not checked yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /competitor for one of your target questions/ }),
    ).toBeNull();
  });
```

- in "says when the last scan failed…", replace the time assertion with `expect(screen.getByText(/the last check didn't finish \(1 Oct 2026, 06:02\)/)).toBeInTheDocument();`
- in "says when the first scan is running", use `/checking your sites now/`;
- in "with scans shows…", replace the `last scan` and heading assertions with:

```ts
    expect(screen.getByText(/last checked 1 Oct 2026, 06:04/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(real.briefing.sentence);
    expect(screen.getByText(real.briefing.subLine)).toBeInTheDocument();
    expect(screen.queryByText("Sample", { exact: true })).toBeNull();
```

`lib/actions/views.test.ts` — remove `activeImpactCounts` from the import and delete the test "counts active actions by impact for configured products only".

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/today components/today lib/actions/views.test.ts`
Expected: FAIL — `result.work` is undefined, `today.briefing` is undefined, the header still says "no scan yet".

- [ ] **Step 3: Write minimal implementation**

`lib/today/types.ts` — add `import type { Briefing } from "@/lib/explain/briefing";` and replace the `headline: string;` field of `TodaySummary` with:

```ts
  /** One plain sentence on overall health and the biggest opportunity, with the counts under it. */
  briefing: Briefing;
```

`lib/today/from-actions.ts` — replace the whole file with:

```ts
import { activeWork } from "@/lib/actions/active-work";
import type { ActionRow } from "@/lib/actions/types";
import { topActiveActions } from "@/lib/actions/views";
import type { Db } from "@/lib/db/client";
import { whoIsOnIt } from "@/lib/explain/actions";
import type { BriefingWork } from "@/lib/explain/briefing";
import type { ActionPreview } from "./types";

const TOP_ACTIONS = 3;

const toPreview = (action: ActionRow): ActionPreview => ({
  id: action.id,
  productId: action.productId,
  area: action.area,
  impact: action.impact,
  title: action.title,
  detail: action.fix,
  href: `/actions#action-${action.id}`,
});

/**
 * Today's actions: the top active ones (open and in progress, board order) of the configured
 * products, how many more the Actions board holds, and every active action's area and who's on
 * it, for the briefing.
 */
export function attentionFromActions(
  db: Db,
  productIds: readonly string[],
): { actions: ActionPreview[]; more: number; work: BriefingWork[] } {
  const top = topActiveActions(db, productIds, TOP_ACTIONS);
  return {
    actions: top.actions.map(toPreview),
    more: top.more,
    work: activeWork(db, productIds).map((a) => ({
      productId: a.productId,
      area: a.area,
      who: whoIsOnIt(a),
    })),
  };
}
```

`lib/today/from-scans.ts` — delete `WORDS`, `headlineFor` and the `Impact` import; add `import { buildBriefing } from "@/lib/explain/briefing";`; replace `todaySummary` with:

```ts
/**
 * Today from real scans, or the clearly flagged sample until some product has scores (still
 * saying whether a scan is under way, or that the last one failed and which sources failed).
 */
export function todaySummary(db: Db, products: readonly Product[], now: Date): TodaySummary {
  const perProduct = products.map((p) => productToday(db, p.id, now));
  const scanning = perProduct.some((p) => p.scanning);
  const scanned = perProduct.flatMap((p) => (p.scannedAt ? [p.scannedAt] : []));
  const failures = perProduct.flatMap((p) => p.failures);
  if (scanned.length === 0) {
    const failed = perProduct.flatMap((p) => (p.failedAt ? [p.failedAt.getTime()] : []));
    const lastFailedAt = failed.length > 0 ? new Date(Math.max(...failed)) : null;
    return { ...sampleToday(products, failures), scanning, lastFailedAt };
  }
  // Actions are current here because the scan job runs the rule sync in the same job as scoring.
  const attention = attentionFromActions(
    db,
    products.map((p) => p.id),
  );
  const scores = perProduct.map((p) => p.row);
  return {
    isSample: false,
    scannedAt: new Date(Math.max(...scanned.map((d) => d.getTime()))),
    scanning,
    lastFailedAt: null,
    briefing: buildBriefing({ products, scores, work: attention.work, failures }),
    scores,
    actions: attention.actions,
    moreActions: attention.more,
    failures,
  };
}
```

`lib/today/sample.ts` — add `import { buildBriefing } from "@/lib/explain/briefing";`, import `ActionPreview` and `SourceFailure` types from `./types`, and replace `sampleToday` with:

```ts
/**
 * Placeholder data for the configured products until a first scan is scored. Always flagged
 * `isSample`; real source failures still show, and the briefing reads the sample's own data.
 */
export function sampleToday(
  products: readonly Product[],
  failures: readonly SourceFailure[] = [],
): TodaySummary {
  const first = products[0];
  if (!first) throw new Error("sampleToday needs at least one product");
  const second = products[1] ?? first;
  const scores = products.map((p) => sampleScores(p.id));
  const actions: ActionPreview[] = [
    {
      id: "sample-1",
      productId: first.id,
      area: "GEO",
      impact: "high",
      title: "An AI assistant cites a competitor for one of your target questions",
      detail: "~1 hr",
      href: null,
    },
    {
      id: "sample-2",
      productId: second.id,
      area: "AEO",
      impact: "medium",
      title: "Add FAQ structured data to your most-visited page",
      detail: "~30 min",
      href: null,
    },
  ];
  // Nothing real has started on the sample's actions: they wait for the owner.
  const work = actions.map((a) => ({ productId: a.productId, area: a.area, who: "you" as const }));
  return {
    isSample: true,
    scannedAt: null,
    scanning: false,
    lastFailedAt: null,
    failures: [...failures],
    moreActions: 0,
    briefing: buildBriefing({ products, scores, work, failures }),
    scores,
    actions,
  };
}
```

`lib/actions/views.ts` — delete the `activeImpactCounts` function and its doc comment.

`components/today/BriefingText.tsx`:

```tsx
import { Tag } from "@/components/ui/Tag";
import type { Briefing } from "@/lib/explain/briefing";

type Props = {
  briefing: Briefing;
  /** Sample data gets a tag above the sentence, so it is never mistaken for real results. */
  isSample: boolean;
  /** 1 on Today; 3 when nested under a section heading (the /design examples). */
  level?: 1 | 3;
};

/** Today's briefing: one plain sentence, and the counts under it. */
export function BriefingText({ briefing, isSample, level = 1 }: Props) {
  const Heading = level === 1 ? "h1" : "h3";
  const size = level === 1 ? "text-3xl" : "text-xl";
  return (
    <div className="flex flex-col gap-2">
      {isSample && (
        <p>
          <Tag tone="warn">Sample</Tag>
        </p>
      )}
      <Heading className={`font-serif leading-tight ${size}`}>{briefing.sentence}</Heading>
      <p className="text-sm text-ink-muted">{briefing.subLine}</p>
    </div>
  );
}
```

`components/today/TodayHeader.tsx` — replace the whole file with:

```tsx
import type { Briefing } from "@/lib/explain/briefing";
import { formatDateTime, formatLongDate } from "@/lib/format/date";
import { BriefingText } from "./BriefingText";

type Props = {
  now: Date;
  timeZone: string;
  locale: string;
  scannedAt: Date | null;
  scanning: boolean;
  lastFailedAt: Date | null;
  briefing: Briefing;
  isSample: boolean;
};

/** When the sites were last checked, in plain words. */
function checkStatus({ scanning, scannedAt, lastFailedAt, timeZone, locale }: Props): string {
  if (scanning) return "checking your sites now";
  if (scannedAt) return `last checked ${formatDateTime(scannedAt, timeZone, locale)}`;
  if (lastFailedAt) {
    return `the last check didn't finish (${formatDateTime(lastFailedAt, timeZone, locale)})`;
  }
  return "not checked yet";
}

/** The date, when the sites were last checked, and the briefing. */
export function TodayHeader(props: Props) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-sm text-ink-muted">
        {formatLongDate(props.now, props.timeZone, props.locale)} · {checkStatus(props)}
      </p>
      <BriefingText briefing={props.briefing} isSample={props.isSample} />
    </header>
  );
}
```

`components/today/TodayView.tsx` — in the `<TodayHeader … />` element replace `headline={today.headline}` with:

```tsx
        briefing={today.briefing}
        isSample={today.isSample}
```

`tests/e2e/shell.spec.ts` — after the imports add:

```ts
/** The sample Today's briefing for the E2E products (lib/today/sample.ts is deterministic). */
const SAMPLE_BRIEFING =
  "Your sites need some work. Biggest opportunity: Recommended by AI assistants for Acme Docs (needs work).";
```

and replace both `await expect(page.getByRole("heading", { level: 1 })).toContainText("Calm waters");` with `await expect(page.getByRole("heading", { level: 1 })).toHaveText(SAMPLE_BRIEFING);`, then add right after the one in the light/dark Today test:

```ts
      await expect(page.getByText("2 things worth doing · nothing is broken")).toBeVisible();
```

`tests/e2e/scans.spec.ts` — in "Today shows the real scores instead of the sample", replace `page.getByText(/· last scan /)` with `page.getByText(/· last checked /)`.

`README.md` — replace the Today bullet under `## Features` with:

```markdown
- **Today** — date, when your sites were last checked, a one-sentence briefing (overall health
  and the biggest opportunity, then how many things are worth doing, how many Claude is
  handling and whether anything is broken), a score table per product (SEO, GEO, AEO with the
  change since the last scan and a 30-day SEO trend), the three issues most worth your
  attention, and a banner when a source failed in the last scan. Until the first scan finishes
  it shows clearly labelled sample data.
```

and replace the Today bullet under `## Reading the results` with:

```markdown
- **Today** (`/`) lists every product's scores. A dash is a gap (no data), never a zero; an
  asterisk marks an incomplete score, where a source was not connected or failed. Each product
  name opens its page. While a scan is queued or running, the page refreshes itself. **Worth
  your attention** shows the top three open or in-progress actions (in the Actions board's
  order), each linked to its card, and the briefing's second line counts every one of them;
  the rest are a link away on the Actions board. Before the first scan is scored, Today shows
  clearly flagged sample data instead.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/today lib/actions components/today && pnpm typecheck && pnpm lint && pnpm check:files`
Expected: PASS; no reference to `headline`/`headlineFor`/`activeImpactCounts` is left (`grep -rn "headlineFor\|activeImpactCounts\|today.headline" lib components app` prints nothing).

- [ ] **Step 5: Commit**

```bash
git add lib/today lib/actions/views.ts lib/actions/views.test.ts components/today/BriefingText.tsx components/today/TodayHeader.tsx components/today/TodayView.tsx components/today/TodayView.test.tsx tests/e2e/shell.spec.ts tests/e2e/scans.spec.ts README.md
git commit -m "$(cat <<'EOF'
feat(today): briefing sentence and sub-line

Today opens with overall health and the biggest opportunity, then how many
things are worth doing, how many Claude is handling and whether anything is
broken. The header says when the sites were last checked; sample data is
tagged. The unused impact counts are gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: "Worth doing next" cards with who's on it

**Files:**
- Create: `lib/today/reason.ts`; Test: `lib/today/reason.test.ts`
- Modify: `lib/today/types.ts` (`ActionPreview`), `lib/today/from-actions.ts`, `lib/today/sample.ts`
- Modify (rewrite): `components/today/ActionCard.tsx`; Test: `components/today/ActionCard.test.tsx`
- Create: `components/today/WorthDoingNext.tsx`
- Modify: `components/today/TodayView.tsx`, `components/design/ExplainExamples.tsx`
- Test: `lib/today/from-actions.test.ts`, `components/today/TodayView.test.tsx`
- Modify: `tests/e2e/shell.spec.ts`, `tests/e2e/actions.spec.ts`, `tests/e2e/scans.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `IMPACT_PHRASE`, `EFFORT_PHRASE`, `WHO_PHRASE`, `whoIsOnIt`, `type WhoOnIt` (Task 7); `AREAS`, `areaKeyOf` (Task 2); `EmptyState` (Task 13); `activeWork` (Task 15).
- Produces:
  - `firstSentence(text: string): string` — one line, at most 160 characters.
  - `ActionPreview = { id: number | string; productId: ProductId; area: IssueArea; impact: Impact; effort: Effort; title: string; reason: string; who: WhoOnIt | null; href: string | null }` (`detail` removed).
  - `NOTHING_TO_DO: { what; when; why }` and `WorthDoingNext(props: { actions: ActionPreview[]; more: number })` (a region named "Worth doing next").
  - `ActionCard(props: { action: ActionPreview })`.

- [ ] **Step 1: Write the failing tests**

`lib/today/reason.test.ts`:

```ts
import { firstSentence } from "./reason";

describe("firstSentence", () => {
  it.each([
    [
      "Pages without a description get a generated snippet. Google writes its own.",
      "Pages without a description get a generated snippet.",
    ],
    ["  Two\nlines and no full stop  ", "Two lines and no full stop"],
    ["Is it fast? Mostly.", "Is it fast?"],
    ["Loads in 2.5 seconds on a phone. That's slow.", "Loads in 2.5 seconds on a phone."],
    ["", ""],
  ])("reads %j as %j", (text, sentence) => {
    expect(firstSentence(text)).toBe(sentence);
  });

  // Review Focus 5: the weekly analyst may write up to 800 characters, on several lines.
  it("shortens a long first sentence at a word, with an ellipsis", () => {
    const short = firstSentence(`${"word ".repeat(60)}end.`);
    expect(short.length).toBeLessThanOrEqual(160);
    expect(short.endsWith("word…")).toBe(true);
    expect(firstSentence("a".repeat(200))).toHaveLength(160);
  });
});
```

`components/today/ActionCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ActionPreview } from "@/lib/today/types";
import { ActionCard } from "./ActionCard";

const TITLE = "Publish an llms.txt guide";
const preview = (over: Partial<ActionPreview> = {}): ActionPreview => ({
  id: 7,
  productId: "acme-docs",
  area: "GEO",
  impact: "high",
  effort: "small",
  title: TITLE,
  reason: "AI assistants find your best pages faster.",
  who: "claude",
  href: "/actions#action-7",
  ...over,
});

describe("ActionCard", () => {
  it("leads with the title, then why, the size of the job and who's on it, with no codes", () => {
    render(<ActionCard action={preview()} />);
    const card = screen.getByRole("article", { name: TITLE });
    expect(within(card).getByRole("link", { name: TITLE })).toHaveAttribute("href", "/actions#action-7");
    expect(card).toHaveTextContent("Big win");
    expect(card).toHaveTextContent("Recommended by AI assistants · quick job");
    expect(card).toHaveTextContent("AI assistants find your best pages faster.");
    expect(card).toHaveTextContent("Acme Docs · Claude is on it");
    expect(card).not.toHaveTextContent(/\b(?:SEO|GEO|AEO)\b/);
  });

  it.each([
    ["pr_waiting", "Pull request waiting for your OK"],
    ["you", "Waiting for you"],
    ["undecided", "New idea, not decided yet"],
  ] as const)("words %s as “%s”", (who, phrase) => {
    render(<ActionCard action={preview({ who })} />);
    expect(screen.getByRole("article")).toHaveTextContent(`Acme Docs · ${phrase}`);
  });

  // Review Focus 5: an agent's reason can be empty.
  it("leaves out an empty reason, an unknown who and the link for a sample", () => {
    render(<ActionCard action={preview({ reason: "", who: null, href: null })} />);
    const card = screen.getByRole("article", { name: TITLE });
    expect(screen.queryByRole("link")).toBeNull();
    expect(card.querySelectorAll("p")).toHaveLength(2);
    expect(card).not.toHaveTextContent(/on it|Waiting|not decided/);
  });
});
```

`lib/today/from-actions.test.ts` — replace the `expect(result.actions[0]).toEqual({ … })` block with:

```ts
    expect(result.actions[0]).toEqual({
      id: started,
      productId: "acme-docs",
      area: "SEO",
      impact: "high",
      effort: "small",
      title: "high started",
      reason: "Pages without a description get a generated snippet.",
      who: "you",
      href: `/actions#action-${started}`,
    });
```

and append inside the Task 16 test "says Claude is on what Claude started…":

```ts
    expect(attentionFromActions(db, PRODUCTS).actions.map((a) => [a.title, a.who])).toEqual([
      ["claude", "claude"],
      ["pr", "pr_waiting"],
    ]);
```

`components/today/TodayView.test.tsx` — add `within` to the Testing Library import; replace the `actions` of the `real` fixture with:

```ts
  actions: [
    {
      id: 7,
      productId: "acme-docs",
      area: "SEO",
      impact: "high",
      effort: "small",
      title: "2 pages have no title",
      reason: "Google uses the title as the headline of each result.",
      who: "claude",
      href: "/actions#action-7",
    },
  ],
```

replace the body of "says so when no action is open" with:

```ts
    renderToday({ ...real, actions: [], failures: [] });
    expect(screen.getByText("Nothing to do right now.")).toBeInTheDocument();
```

and add:

```ts
  it("lists what's worth doing next with why, the size of the job and who's on it", () => {
    renderToday(real);
    const section = screen.getByRole("region", { name: "Worth doing next" });
    const card = within(section).getByRole("article", { name: "2 pages have no title" });
    expect(card).toHaveTextContent("Big win");
    expect(card).toHaveTextContent("Found on Google · quick job");
    expect(card).toHaveTextContent("Google uses the title as the headline of each result.");
    expect(card).toHaveTextContent("Acme Docs · Claude is on it");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/today components/today`
Expected: FAIL — `./reason` is missing, previews have no `who`/`reason`, there is no "Worth doing next" region.

- [ ] **Step 3: Write minimal implementation**

`lib/today/reason.ts`:

```ts
/** Longest reason a Today card shows. */
const MAX_CHARS = 160;
/** Cutting at a word earlier than this would lose the point: cut mid-word instead. */
const MIN_WORD_CUT = 80;

/**
 * The first sentence of `text` on one line, at most 160 characters (cut at a word, with "…").
 * Reasons can come from the weekly analyst, so length and line breaks are never trusted.
 */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](?=\s|$)/);
  const sentence = end === -1 ? flat : flat.slice(0, end + 1);
  if (sentence.length <= MAX_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_CHARS - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space >= MIN_WORD_CUT ? cut.slice(0, space) : cut).trimEnd()}…`;
}
```

`lib/today/types.ts` — import `type Effort` (with `Impact`, `IssueArea`) from `@/lib/scan/issues` and `type WhoOnIt` from `@/lib/explain/actions`, and replace `ActionPreview` with:

```ts
export type ActionPreview = {
  /** The action's id; a string for the sample's placeholders. */
  id: number | string;
  productId: ProductId;
  area: IssueArea;
  impact: Impact;
  effort: Effort;
  title: string;
  /** Why it matters, in one sentence; empty when there is none (the card leaves it out). */
  reason: string;
  /** Who's on it; null when unknown. */
  who: WhoOnIt | null;
  /** Where the action lives on the Actions board; null for the sample. */
  href: string | null;
};
```

`lib/today/from-actions.ts` — replace the whole file with:

```ts
import { activeWork } from "@/lib/actions/active-work";
import type { ActionRow } from "@/lib/actions/types";
import { topActiveActions } from "@/lib/actions/views";
import type { Db } from "@/lib/db/client";
import { type WhoOnIt, whoIsOnIt } from "@/lib/explain/actions";
import type { BriefingWork } from "@/lib/explain/briefing";
import { firstSentence } from "./reason";
import type { ActionPreview } from "./types";

const TOP_ACTIONS = 3;

const toPreview = (action: ActionRow, who: WhoOnIt | null): ActionPreview => ({
  id: action.id,
  productId: action.productId,
  area: action.area,
  impact: action.impact,
  effort: action.effort,
  title: action.title,
  reason: firstSentence(action.why),
  who,
  href: `/actions#action-${action.id}`,
});

/**
 * Today's actions: the top active ones (open and in progress, board order) of the configured
 * products with who's on each, how many more the Actions board holds, and every active action's
 * area and who's on it, for the briefing.
 */
export function attentionFromActions(
  db: Db,
  productIds: readonly string[],
): { actions: ActionPreview[]; more: number; work: BriefingWork[] } {
  const active = activeWork(db, productIds);
  const who = new Map(active.map((a) => [a.id, whoIsOnIt(a)]));
  const top = topActiveActions(db, productIds, TOP_ACTIONS);
  return {
    actions: top.actions.map((row) => toPreview(row, who.get(row.id) ?? null)),
    more: top.more,
    work: active.map((a) => ({ productId: a.productId, area: a.area, who: who.get(a.id) ?? null })),
  };
}
```

`lib/today/sample.ts` — replace the two sample actions and the `work` line with:

```ts
  const actions: ActionPreview[] = [
    {
      id: "sample-1",
      productId: first.id,
      area: "GEO",
      impact: "high",
      effort: "medium",
      title: "An AI assistant cites a competitor for one of your target questions",
      reason: "When people ask that question, they're pointed somewhere else.",
      who: "you",
      href: null,
    },
    {
      id: "sample-2",
      productId: second.id,
      area: "AEO",
      impact: "medium",
      effort: "small",
      title: "Add FAQ structured data to your most-visited page",
      reason: "Marked-up answers are the easiest for Google and AI assistants to quote.",
      who: "you",
      href: null,
    },
  ];
  const work = actions.map((a) => ({ productId: a.productId, area: a.area, who: a.who }));
```

`components/today/ActionCard.tsx` — replace the whole file with:

```tsx
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { EFFORT_PHRASE, IMPACT_PHRASE, WHO_PHRASE } from "@/lib/explain/actions";
import { AREAS, areaKeyOf } from "@/lib/explain/areas";
import { productById } from "@/lib/products/catalog";
import type { ActionPreview } from "@/lib/today/types";

/** One thing worth doing: what, why, how big a job, and who's on it; links to its board card. */
export function ActionCard({ action }: { action: ActionPreview }) {
  const product = productById(action.productId);
  const titleId = `today-action-${action.id}`;
  return (
    <Panel className="p-4">
      <article aria-labelledby={titleId} className="flex flex-col gap-1.5">
        <p className="flex flex-wrap gap-1.5">
          <Tag tone={action.impact === "high" ? "accent" : "neutral"}>
            {IMPACT_PHRASE[action.impact]}
          </Tag>
          <Tag tone="neutral">
            {AREAS[areaKeyOf(action.area)].name} · {EFFORT_PHRASE[action.effort]}
          </Tag>
        </p>
        <h3 id={titleId} className="text-base text-ink">
          {action.href ? (
            <Link href={action.href} className="rounded-sm hover:text-accent">
              {action.title}
            </Link>
          ) : (
            action.title
          )}
        </h3>
        {action.reason && <p className="text-sm text-ink-muted">{action.reason}</p>}
        <p className="text-xs text-ink-muted">
          {product.name}
          {action.who && (
            <>
              {" · "}
              <span className="text-ink">{WHO_PHRASE[action.who]}</span>
            </>
          )}
        </p>
      </article>
    </Panel>
  );
}
```

`components/today/WorthDoingNext.tsx`:

```tsx
import Link from "next/link";
import { EmptyState } from "@/components/explain/EmptyState";
import type { ActionPreview } from "@/lib/today/types";
import { ActionCard } from "./ActionCard";

/** What Today says when nothing is open. */
export const NOTHING_TO_DO = {
  what: "Nothing to do right now.",
  when: "New ideas appear here after each daily check and each weekly report.",
  why: "Harbour only suggests a change when a check finds something worth fixing.",
} as const;

/** Today's top actions as plain cards, with the rest a link away on the Actions board. */
export function WorthDoingNext({ actions, more }: { actions: ActionPreview[]; more: number }) {
  return (
    <section aria-labelledby="worth-doing-heading" className="flex flex-col gap-3">
      <h2 id="worth-doing-heading" className="font-serif text-xl">
        Worth doing next
      </h2>
      {actions.length === 0 ? (
        <EmptyState {...NOTHING_TO_DO} />
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            The changes most likely to help, biggest wins first.
          </p>
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </>
      )}
      {more > 0 && (
        <p className="text-sm">
          <Link href="/actions" className="rounded-sm text-accent underline underline-offset-2">
            {more} more on the Actions board
          </Link>
        </p>
      )}
    </section>
  );
}
```

`components/today/TodayView.tsx` — remove the `Link` and `ActionCard` imports, add `import { WorthDoingNext } from "./WorthDoingNext";`, and replace the whole `<section aria-labelledby="attention-heading">…</section>` element with:

```tsx
      <WorthDoingNext actions={today.actions} more={today.moreActions} />
```

`components/design/ExplainExamples.tsx` — replace the empty-state example's literal props with the shared copy (one source for the message):

```tsx
import { NOTHING_TO_DO } from "@/components/today/WorthDoingNext";
```

```tsx
      <Example label="Empty state">
        <EmptyState {...NOTHING_TO_DO} />
      </Example>
```

`tests/e2e/shell.spec.ts` — replace `page.getByRole("heading", { name: "Worth your attention", exact: true })` with `page.getByRole("heading", { name: "Worth doing next", exact: true })`.

`tests/e2e/actions.spec.ts` — in "Today lists the top three actions in board order…", replace `page.getByRole("region", { name: "Worth your attention" })` with `page.getByRole("region", { name: "Worth doing next" })`.

`tests/e2e/scans.spec.ts` — change the comment "// Worth your attention lists the actions the scan opened…" to "// Worth doing next lists the actions the scan opened…".

`README.md` — replace the Today bullet under `## Features` with:

```markdown
- **Today** — date, when your sites were last checked, a one-sentence briefing (overall health
  and the biggest opportunity, then how many things are worth doing, how many Claude is
  handling and whether anything is broken), a score table per product (SEO, GEO, AEO with the
  change since the last scan and a 30-day SEO trend), **Worth doing next** (the top three
  actions as plain cards: why each matters, its area, how big a job it is and who's on it),
  and a banner when a source failed in the last scan. Until the first scan finishes it shows
  clearly labelled sample data.
```

and replace the Today bullet under `## Reading the results` with:

```markdown
- **Today** (`/`) lists every product's scores. A dash is a gap (no data), never a zero; an
  asterisk marks an incomplete score, where a source was not connected or failed. Each product
  name opens its page. While a scan is queued or running, the page refreshes itself. **Worth
  doing next** shows the top three open or in-progress actions (in the Actions board's order),
  each linked to its card and saying who's on it (Claude is on it, Pull request waiting for
  your OK, or Waiting for you), and the briefing's second line counts every one of them; the
  rest are a link away on the Actions board. Before the first scan is scored, Today shows
  clearly flagged sample data instead.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/today components/today components/design && pnpm typecheck && pnpm lint && pnpm check:files`
Expected: PASS; `grep -rn "Worth your attention\|\.detail\b" components lib tests` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/today components/today components/design/ExplainExamples.tsx tests/e2e/shell.spec.ts tests/e2e/actions.spec.ts tests/e2e/scans.spec.ts README.md
git commit -m "$(cat <<'EOF'
feat(today): Worth doing next cards with who's on it

Each card leads with the title, then one sentence on why, the area and how
big a job it is, and who's on it. Nothing open shows an empty state that
says when ideas arrive.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: A table of verdicts; the numbers under Technical details

**Files:**
- Modify: `lib/today/types.ts` (`ProductScores.scanned`), `lib/today/from-scans.ts`, `lib/today/sample.ts`
- Create: `components/today/VerdictTable.tsx`; Test: `components/today/VerdictTable.test.tsx`
- Create: `components/today/ScoresSection.tsx`; Test: `components/today/ScoresSection.test.tsx`
- Modify: `components/today/TodayView.tsx`
- Test: `lib/today/from-scans.test.ts`, `components/today/ScoreTable.test.tsx`, `components/today/TodayView.test.tsx`
- Modify: `tests/e2e/shell.spec.ts`, `tests/e2e/scans.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `VerdictLine` (Task 10), `Explainer` (Task 11), `TechnicalDetails` (Task 12), `AREA_ORDER`, `AREAS` (Task 2), `GAP_REASONS` (Task 1); the unchanged `ScoreTable`.
- Produces: `ProductScores.scanned: boolean`; `VerdictTable(props: { scores: ProductScores[] })` (table named "Scores by product"); `ScoresSection(props: { scores: ProductScores[] })` (region "How your sites are doing": the verdict table, a list "What the columns mean" with an `Explainer` per area, and `ScoreTable` inside `TechnicalDetails id="today-scores" topic="scores in numbers"`).

- [ ] **Step 1: Write the failing tests**

`components/today/VerdictTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ProductScores } from "@/lib/today/types";
import { VerdictTable } from "./VerdictTable";

const none = { seo: null, geo: null, aeo: null };
const row = (over: Partial<ProductScores> = {}): ProductScores => ({
  productId: "acme-docs",
  scanned: true,
  totals: { seo: 78, geo: 46, aeo: null },
  complete: { seo: true, geo: false, aeo: false },
  deltas: { seo: 2, geo: null, aeo: null },
  trend: [76, 78],
  ...over,
});
const cellsOf = (name: RegExp) => within(screen.getByRole("row", { name })).getAllByRole("cell");

describe("VerdictTable", () => {
  it("has a row per product and a plain-named column per area", () => {
    render(<VerdictTable scores={[row()]} />);
    const table = screen.getByRole("table", { name: "Scores by product" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Product",
      "Found on Google",
      "Recommended by AI assistants",
      "Answer-ready",
    ]);
    expect(within(table).getByRole("link", { name: "Acme Docs" })).toHaveAttribute(
      "href",
      "/products/acme-docs",
    );
  });

  it("leads each cell with the verdict, the number beside it, and says what's missing", () => {
    render(<VerdictTable scores={[row()]} />);
    const [seo, geo, aeo] = cellsOf(/Acme Docs/);
    expect(seo).toHaveTextContent("Good 78 out of 100 up 2 since the last check");
    expect(geo).toHaveTextContent("Needs work 46 out of 100* (some data missing)");
    expect(aeo).toHaveTextContent("No score yet The data for this didn't arrive.");
    expect(screen.getByText(/Some data was missing in the last check/)).toBeInTheDocument();
  });

  it("says a product not checked yet is a gap, not a zero", () => {
    render(
      <VerdictTable
        scores={[row({ productId: "fern-and-field", scanned: false, totals: none, deltas: none, trend: [] })]}
      />,
    );
    for (const cell of cellsOf(/Fern & Field/)) {
      expect(cell).toHaveTextContent("No score yet Not checked yet.");
    }
    expect(screen.queryByText(/Some data was missing/)).toBeNull();
  });

  // Review Focus 2: every collector failed, so the product was scanned but has no scores.
  it("says a scanned product with no scores is missing data, never Needs work", () => {
    render(<VerdictTable scores={[row({ totals: none, deltas: none })]} />);
    for (const cell of cellsOf(/Acme Docs/)) {
      expect(cell).toHaveTextContent("No score yet The data for this didn't arrive.");
    }
    expect(screen.queryByText("Needs work")).toBeNull();
  });
});
```

`components/today/ScoresSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { sampleToday } from "@/lib/today/sample";
import { ScoresSection } from "./ScoresSection";

const { scores } = sampleToday(getProducts());

describe("ScoresSection", () => {
  it("leads with verdicts and explains each area in one line", () => {
    render(<ScoresSection scores={scores} />);
    const section = screen.getByRole("region", { name: "How your sites are doing" });
    expect(within(section).getByRole("table", { name: "Scores by product" })).toBeVisible();
    const guide = within(section).getByRole("list", { name: "What the columns mean" });
    for (const name of ["Found on Google", "Recommended by AI assistants", "Answer-ready"]) {
      expect(within(guide).getByRole("button", { name: `What's this? (${name})` })).toBeVisible();
    }
  });

  it("keeps the numbers, codes and 30-day trend one click away under Technical details", () => {
    render(<ScoresSection scores={scores} />);
    const numbers = screen.getByRole("table", { name: "Visibility scores by product", hidden: true });
    expect(numbers.closest("details")).not.toBeNull();
    expect(numbers).not.toBeVisible();
    expect(screen.getByText(/^Technical details/)).toHaveTextContent(
      "Technical details (scores in numbers)",
    );
  });
});
```

`components/today/ScoreTable.test.tsx` — add `scanned: true,` to the `row` helper's object.

`lib/today/from-scans.test.ts` — in "summarises real scores…", add `scanned: true,` to the Acme Docs row and `scanned: false,` to the Fern & Field row of the `today?.scores` expectation.

`components/today/TodayView.test.tsx` — add `scanned: true,` to the `real` fixture's score row, and add:

```ts
  it("shows plain verdicts per product, with the numbers under Technical details", () => {
    renderToday(real);
    const table = screen.getByRole("table", { name: "Scores by product" });
    const [seo, geo] = within(within(table).getByRole("row", { name: /Acme Docs/ })).getAllByRole("cell");
    expect(seo).toHaveTextContent("Fair 61 out of 100 up 2 since the last check");
    expect(geo).toHaveTextContent("Needs work 40 out of 100");
    expect(
      screen.getByRole("table", { name: "Visibility scores by product", hidden: true }),
    ).not.toBeVisible();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/today components/today`
Expected: FAIL — `./VerdictTable` and `./ScoresSection` are missing; `scanned` is not on `ProductScores`.

- [ ] **Step 3: Write minimal implementation**

`lib/today/types.ts` — add to `ProductScores`, after `productId`:

```ts
  /** Whether the product has a scored scan: a missing score then means its data didn't arrive. */
  scanned: boolean;
```

`lib/today/from-scans.ts` — in `productToday`, add `scanned: latest !== null,` to `row` after `productId`.

`lib/today/sample.ts` — in `sampleScores`, add `scanned: true,` after `productId`.

`components/today/VerdictTable.tsx`:

```tsx
import Link from "next/link";
import { VerdictLine } from "@/components/explain/VerdictLine";
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import { GAP_REASONS } from "@/lib/explain/verdict";
import { productById } from "@/lib/products/catalog";
import type { ProductScores } from "@/lib/today/types";

/** One row per product, one plain-named column per area, each cell a compact verdict. */
export function VerdictTable({ scores }: { scores: ProductScores[] }) {
  const anyPartial = scores.some((row) =>
    AREA_ORDER.some((key) => row.totals[key] !== null && !row.complete[key]),
  );
  return (
    <Panel className="overflow-x-auto px-4">
      <table className="w-full text-sm" aria-label="Scores by product">
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-2.5 pr-3 font-normal">
              Product
            </th>
            {AREA_ORDER.map((key) => (
              <th key={key} scope="col" className="py-2.5 pr-3 font-normal">
                {AREAS[key].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scores.map((row) => {
            const product = productById(row.productId);
            const missingReason = row.scanned ? GAP_REASONS.dataMissing : GAP_REASONS.notChecked;
            return (
              <tr key={row.productId} className="border-t border-line align-top">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <Link
                    href={`/products/${product.id}`}
                    className="inline-flex items-center gap-2 rounded-sm hover:text-accent"
                  >
                    <ProductDot product={product} />
                    {product.name}
                  </Link>
                </th>
                {AREA_ORDER.map((key) => (
                  <td key={key} className="py-2.5 pr-3">
                    <VerdictLine
                      compact
                      area={key}
                      score={row.totals[key]}
                      delta={row.deltas[key]}
                      complete={row.complete[key]}
                      missingReason={missingReason}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {anyPartial && (
        <p className="border-t border-line py-2 text-2xs text-ink-muted">
          <span aria-hidden="true" className="text-warn">
            *
          </span>{" "}
          Some data was missing in the last check, so this verdict may change. Open the product
          to see what's missing.
        </p>
      )}
    </Panel>
  );
}
```

`components/today/ScoresSection.tsx`:

```tsx
import { Explainer } from "@/components/explain/Explainer";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { AREA_ORDER, AREAS } from "@/lib/explain/areas";
import type { ProductScores } from "@/lib/today/types";
import { ScoreTable } from "./ScoreTable";
import { VerdictTable } from "./VerdictTable";

/** Today's scores: plain verdicts first, what each area means, and the numbers one click away. */
export function ScoresSection({ scores }: { scores: ProductScores[] }) {
  return (
    <section aria-labelledby="scores-heading" className="flex flex-col gap-4">
      <h2 id="scores-heading" className="font-serif text-xl">
        How your sites are doing
      </h2>
      <VerdictTable scores={scores} />
      <ul aria-label="What the columns mean" className="flex flex-col gap-3">
        {AREA_ORDER.map((key) => {
          const area = AREAS[key];
          return (
            <li key={key} className="flex flex-col gap-1">
              <p className="text-sm font-medium">{area.name}</p>
              <Explainer
                topic={area.name}
                oneLiner={area.oneLiner}
                parts={area.parts}
                nextStep={{ href: `/actions?area=${area.code}`, label: `See ideas for ${area.name}` }}
              />
            </li>
          );
        })}
      </ul>
      <TechnicalDetails id="today-scores" topic="scores in numbers">
        <ScoreTable scores={scores} />
      </TechnicalDetails>
    </section>
  );
}
```

`components/today/TodayView.tsx` — replace `import { ScoreTable } from "./ScoreTable";` with `import { ScoresSection } from "./ScoresSection";` and `<ScoreTable scores={today.scores} />` with `<ScoresSection scores={today.scores} />`.

`tests/e2e/shell.spec.ts` — in the light/dark Today test replace `page.getByRole("table", { name: "Visibility scores by product" })` with `page.getByRole("table", { name: "Scores by product" })`.

`tests/e2e/scans.spec.ts` — replace the test "Today shows the real scores instead of the sample" with:

```ts
test("Today shows the real verdicts instead of the sample, with the numbers a click away", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/· last checked /)).toBeVisible();
  await expect(page.getByText("Sample data")).toHaveCount(0);
  const table = page.getByRole("table", { name: "Scores by product" });
  for (const cell of await table.getByRole("row", { name: /Acme Docs/ }).getByRole("cell").all()) {
    await expect(cell).toHaveText(/^(Strong|Good|Fair|Needs work) \d+ out of 100/);
  }
  // Products not scanned yet show a gap, never a zero.
  await expect(
    table.getByRole("row", { name: /Fern & Field/ }).getByRole("cell").first(),
  ).toHaveText(/No score yet/);
  // The numbers stay one click away, under Technical details.
  await page.getByText("Technical details (scores in numbers)").click();
  const numbers = page.getByRole("table", { name: "Visibility scores by product" });
  await expect(numbers).toBeVisible();
  const acme = numbers.getByRole("row", { name: /Acme Docs/ });
  for (const cell of (await acme.getByRole("cell").all()).slice(0, 3)) {
    await expect(cell).toHaveText(/^\d+/);
  }
  // Worth doing next lists the actions the scan opened, each linked to its board card.
  await expect(page.getByRole("link", { name: "1 page has no title" })).toHaveAttribute(
    "href",
    /^\/actions#action-\d+$/,
  );
});
```

`README.md` — replace the Today bullet under `## Features` with:

```markdown
- **Today** — date, when your sites were last checked, a one-sentence briefing (overall health
  and the biggest opportunity, then how many things are worth doing, how many Claude is
  handling and whether anything is broken), a plain verdict per product and area (Found on
  Google, Recommended by AI assistants, Answer-ready: Strong 85+, Good 70–84, Fair 50–69 or
  Needs work under 50, with the score and its change beside it; "What's this?" explains each
  area, and the numbers with a 30-day SEO trend sit under Technical details), **Worth doing
  next** (the top three actions as plain cards: why each matters, its area, how big a job it
  is and who's on it), and a banner when a source failed in the last scan. Until the first
  scan finishes it shows clearly labelled sample data.
```

and replace the Today bullet under `## Reading the results` with:

```markdown
- **Today** (`/`) gives every product a verdict per area. A missing score reads "No score yet"
  with the reason (a gap, never a zero); an asterisk marks a verdict where some data was
  missing because a source was not connected or failed, and the numbers are under **Technical
  details**. Each product name opens its page. While a scan is queued or running, the page
  refreshes itself. **Worth doing next** shows the top three open or in-progress actions (in
  the Actions board's order), each linked to its card and saying who's on it (Claude is on it,
  Pull request waiting for your OK, or Waiting for you), and the briefing's second line counts
  every one of them; the rest are a link away on the Actions board. Before the first scan is
  scored, Today shows clearly flagged sample data instead.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run lib/today components/today && pnpm typecheck && pnpm lint && pnpm check:files`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add lib/today components/today tests/e2e/shell.spec.ts tests/e2e/scans.spec.ts README.md
git commit -m "$(cat <<'EOF'
feat(today): a table of verdicts; the numbers under Technical details

Each product and area reads Strong, Good, Fair or Needs work with the score
small beside it, or says why there's no score. "What's this?" explains each
area; the numeric table and 30-day trend stay one click away.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Calm notices, behind the scenes

**Files:**
- Modify (rewrite): `components/today/SourceFailures.tsx`; Test: `components/today/SourceFailures.test.tsx` (new)
- Modify (rewrite): `components/today/BackupNotice.tsx`; Test: `components/today/BackupNotice.test.tsx`
- Modify: `components/today/CostMeter.tsx`; Test: `components/today/CostMeter.test.tsx`
- Modify: `components/today/SampleBanner.tsx`, `components/today/TodayView.tsx`; Test: `components/today/TodayView.test.tsx`
- Modify: `components/design/OpsExamples.tsx`, `components/design/ops-example-data.ts`
- Modify: `tests/e2e/settings.spec.ts`, `README.md`

**Interfaces:**
- Consumes: `sourceName`, `sourceTrouble` (Task 6); `TechnicalDetails` (Task 12).
- Produces: `SourceFailures(props: { failures: SourceFailure[] })` (region named by its `<h3>`); `BackupNotice(props: { backup; timeZone; locale; detailsTopic?: string })`; the final `TodayView` layout: header, sample banner, `ScoresSection`, `WorthDoingNext`, then a "Behind the scenes" section with the cost meter, backup notice and source failures.

- [ ] **Step 1: Write the failing tests**

`components/today/SourceFailures.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { SourceFailures } from "./SourceFailures";

describe("SourceFailures", () => {
  it("says what happened, whether it matters and what to do, with raw errors tucked away", () => {
    render(
      <SourceFailures
        failures={[{ productId: "acme-docs", collector: "pagespeed", error: "PageSpeed Insights quota exceeded" }]}
      />,
    );
    const notice = screen.getByRole("region", {
      name: "Google speed test (PageSpeed) had a problem in the last check",
    });
    expect(notice).toHaveTextContent("Google speed test (PageSpeed) · Acme Docs");
    expect(notice).toHaveTextContent(
      "Scores that use this data are marked as missing some data until it works again.",
    );
    expect(within(notice).getByRole("link", { name: "check your data sources" })).toHaveAttribute(
      "href",
      "/settings/sources",
    );
    expect(screen.getByText(/PageSpeed Insights quota exceeded/)).not.toBeVisible();
  });

  it("counts several failing sources once each, and says when no error was recorded", () => {
    render(
      <SourceFailures
        failures={[
          { productId: "acme-docs", collector: "pagespeed", error: null },
          { productId: "fern-and-field", collector: "crawler", error: "Could not crawl" },
        ]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "2 data sources had a problem in the last check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("pagespeed · acme-docs: no error recorded")).toBeInTheDocument();
  });

  it("shows nothing when every source worked", () => {
    const { container } = render(<SourceFailures failures={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

`components/today/BackupNotice.test.tsx` — replace the first four tests with:

```tsx
  it("says the backup didn't finish, that live data is fine, and when Harbour tries again", () => {
    show(EXAMPLE_BACKUPS.failed);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The backup on 2 Oct, 04:10 didn't finish. Your live data is fine, but your newest spare copy is older than it should be. Harbour tries again at Saturday 3 Oct, 03:15 — details in Settings.",
    );
    expect(screen.getByRole("link", { name: "details in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
    expect(screen.getByText("No space left on device")).not.toBeVisible();
  });

  it("points to Back up now when nightly backups are off", () => {
    show({ ...EXAMPLE_BACKUPS.failed, enabled: false, next: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "The backup on 2 Oct, 04:10 didn't finish. Your live data is fine, but your newest spare copy is older than it should be. Nightly backups are off, so run Back up now in Settings.",
    );
    expect(screen.queryByText(/tries again/)).toBeNull();
    expect(screen.getByRole("link", { name: "Back up now in Settings" })).toHaveAttribute(
      "href",
      "/settings#backups",
    );
  });

  it("says when there has been no backup for two days", () => {
    show(EXAMPLE_BACKUPS.stale);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No backup in the last 2 days. Your live data is fine, but there's no recent spare copy. Check that Harbour's background worker is running — details in Settings.",
    );
  });

  it("says when the backup folder can't be opened", () => {
    show(EXAMPLE_BACKUPS.unreadable);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Harbour can't open the backup folder, so it can't check your spare copies. Check the folder's permissions — details in Settings.",
    );
  });
```

`components/today/CostMeter.test.tsx` — replace the first three tests and the "reached" assertion with:

```tsx
  it("says no paid data is connected and that nothing is being spent", () => {
    renderMeter({ state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0 });
    expect(
      screen.getByText("No paid data connected — Harbour is using free data only, so nothing is being spent."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/spent this month/)).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("still shows what was spent this month after a source was disconnected", () => {
    renderMeter({ state: "no-paid-sources", spentMicro: A$(1.23), unconfirmedMicro: 0 });
    expect(screen.getByText(/^No paid data connected · A\$1\.23 spent this month/)).toBeInTheDocument();
  });

  it("says paid data is off until a budget is set, and links to how", () => {
    renderMeter({ state: "no-budget", spentMicro: 0, unconfirmedMicro: 0 });
    expect(screen.getByText(/^Paid data is off until you set a monthly budget/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /how to set one/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/#costs-and-budget$/),
    );
  });
```

and in "says when paid sources resume once the budget is reached, as a status" use:

```tsx
    expect(screen.getByRole("status")).toHaveTextContent(
      "Budget reached — paid data is paused until 1 Nov. Free checks carry on as normal.",
    );
```

`components/today/TodayView.test.tsx`:
- in "says when the last scan failed before any scores exist", replace `expect(screen.getByText(/Crawler · Acme Docs/)).toHaveTextContent("Could not crawl");` with:

```ts
    expect(screen.getByText("Page check · Acme Docs")).toBeInTheDocument();
    expect(screen.getByText("crawler · acme-docs: Could not crawl")).not.toBeVisible();
```

- in "with scans shows…", replace the two source-failure assertions with:

```ts
    expect(
      screen.getByRole("heading", { name: "Google speed test (PageSpeed) had a problem in the last check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Google speed test (PageSpeed) · Acme Docs")).toBeInTheDocument();
```

- in "shows the cost meter on the sample and on real Today", replace both `screen.getByText("No paid sources connected")` with `screen.getByText(/^No paid data connected/)`;
- in "warns about a failed or stale backup…", use `/The backup on 2 Oct, 03:10 didn't finish/`, `/No backup in the last 2 days/` and `/can't open the backup folder/`;
- add:

```ts
  it("keeps spend, backups and data source trouble together, behind the scenes", () => {
    renderToday(real, EXAMPLE_BACKUPS.stale);
    const behind = screen.getByRole("region", { name: "Behind the scenes" });
    expect(behind).toHaveTextContent(/^Behind the scenes/);
    expect(behind).toHaveTextContent("No paid data connected");
    expect(behind).toHaveTextContent("No backup in the last 2 days");
    expect(behind).toHaveTextContent("Google speed test (PageSpeed) had a problem in the last check");
  });
```

`tests/e2e/settings.spec.ts` — in "no budget means no paid calls, on Settings and Today", replace `budget.getByText("No paid sources connected")` with `budget.getByText(/^No paid data connected/)` and `page.getByRole("main").getByText("No paid sources connected")` with `page.getByRole("main").getByText(/^No paid data connected/)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/today`
Expected: FAIL — old wording ("failed:", "No paid sources connected", "A source failed in the last scan") and no "Behind the scenes" region.

- [ ] **Step 3: Write minimal implementation**

`components/today/SourceFailures.tsx` — replace the whole file with:

```tsx
import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { sourceName, sourceTrouble } from "@/lib/explain/sources";
import { productById } from "@/lib/products/catalog";
import type { SourceFailure } from "@/lib/today/types";

const keyOf = (f: SourceFailure) => `${f.productId}:${f.collector}`;

/** Data sources that failed in a product's last check: what happened, does it matter, what to do. */
export function SourceFailures({ failures }: { failures: SourceFailure[] }) {
  const heading = sourceTrouble(failures);
  if (heading === null) return null;
  return (
    <section
      aria-labelledby="failures-heading"
      className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink"
    >
      <h3 id="failures-heading" className="font-medium">
        {heading}
      </h3>
      <ul className="flex flex-col gap-0.5">
        {failures.map((f) => (
          <li key={keyOf(f)}>
            {sourceName(f.collector)} · {productById(f.productId).name}
          </li>
        ))}
      </ul>
      <p>
        Scores that use this data are marked as missing some data until it works again. Harbour
        tries again in the next check; if it keeps happening,{" "}
        <Link href="/settings/sources" className="rounded-sm text-accent hover:underline">
          check your data sources
        </Link>
        .
      </p>
      <TechnicalDetails id="today-source-failures" topic="data source errors">
        <ul className="flex flex-col gap-0.5 font-mono">
          {failures.map((f) => (
            <li key={keyOf(f)}>
              {f.collector} · {f.productId}: {f.error ?? "no error recorded"}
            </li>
          ))}
        </ul>
      </TechnicalDetails>
    </section>
  );
}
```

`components/today/BackupNotice.tsx` — replace the whole file with:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { formatShortDateTime, formatWeekdayTime } from "@/lib/format/date";
import type { BackupStatus } from "@/lib/ops/backup-status";

const SETTINGS = (text: string) => (
  <Link href="/settings#backups" className="rounded-sm text-accent hover:underline">
    {text}
  </Link>
);
/** Does it matter: the live database is untouched; only the spare copy is behind. */
const STILL_SAFE = "Your live data is fine, but your newest spare copy is older than it should be.";

type Props = {
  backup: Pick<BackupStatus, "health" | "lastFailure" | "enabled" | "next">;
  timeZone: string;
  locale: string;
  /** Names the Technical details for screen readers when several notices share a page (/design). */
  detailsTopic?: string;
};

function failedMessage({ backup, timeZone, locale }: Props): ReactNode {
  const { lastFailure, next } = backup;
  const what = lastFailure
    ? `The backup on ${formatShortDateTime(lastFailure.at, timeZone, locale)} didn't finish.`
    : "The last backup didn't finish.";
  // Only the schedule retries; with it off, nothing runs until the owner chooses Back up now.
  if (backup.enabled && next) {
    return (
      <>
        {what} {STILL_SAFE} Harbour tries again at {formatWeekdayTime(next, timeZone, locale)} —{" "}
        {SETTINGS("details in Settings")}.
      </>
    );
  }
  return (
    <>
      {what} {STILL_SAFE} Nightly backups are off, so run {SETTINGS("Back up now in Settings")}.
    </>
  );
}

function message(props: Props): ReactNode {
  if (props.backup.health === "stale") {
    return (
      <>
        No backup in the last 2 days. Your live data is fine, but there's no recent spare copy.
        Check that Harbour's background worker is running — {SETTINGS("details in Settings")}.
      </>
    );
  }
  if (props.backup.health === "unreadable") {
    return (
      <>
        Harbour can't open the backup folder, so it can't check your spare copies. Check the
        folder's permissions — {SETTINGS("details in Settings")}.
      </>
    );
  }
  return failedMessage(props);
}

/** Today's notice when backups need a look: what happened, whether it matters, what to do. */
export function BackupNotice(props: Props) {
  const { health, lastFailure } = props.backup;
  if (health !== "failed" && health !== "stale" && health !== "unreadable") return null;
  return (
    <div role="status" className="flex flex-col gap-1 rounded-sm bg-warn-soft px-3 py-2 text-xs text-ink">
      <p>{message(props)}</p>
      {health === "failed" && (
        <TechnicalDetails id="today-backup" topic={props.detailsTopic ?? "backup error"}>
          <p className="font-mono">{lastFailure?.error ?? "No error was recorded."}</p>
        </TechnicalDetails>
      )}
    </div>
  );
}
```

`components/today/CostMeter.tsx` — replace the `no-paid-sources` and `no-budget` branches with:

```tsx
  if (view.state === "no-paid-sources") {
    return (
      <p className="text-sm text-ink-muted">
        {view.spentMicro > 0
          ? `No paid data connected · ${aud(view.spentMicro)} spent this month${unconfirmed}`
          : "No paid data connected — Harbour is using free data only, so nothing is being spent."}
      </p>
    );
  }
  if (view.state === "no-budget") {
    return (
      <p className="text-sm text-ink-muted">
        Paid data is off until you set a monthly budget —{" "}
        <DocsLink href={DOCS_LINKS.costs}>how to set one</DocsLink>
      </p>
    );
  }
```

and the `reached` paragraph's text with:

```tsx
          Budget reached — paid data is paused until{" "}
          {resumes.format(monthWindow(now, timeZone).end)}. Free checks carry on as normal.
```

`components/today/SampleBanner.tsx` — replace the paragraph's text with:

```tsx
      Sample data — real scores replace it when the first check finishes. Open a product and
      choose <strong className="font-medium">Scan now</strong>, or wait for the daily check.
```

`components/today/TodayView.tsx` — replace the whole file with:

```tsx
import { RefreshWhileScanning } from "@/components/products/RefreshWhileScanning";
import type { CostMeterView } from "@/lib/costs/meter-view";
import type { BackupStatus } from "@/lib/ops/backup-status";
import type { TodaySummary } from "@/lib/today/types";
import { BackupNotice } from "./BackupNotice";
import { CostMeter } from "./CostMeter";
import { SampleBanner } from "./SampleBanner";
import { ScoresSection } from "./ScoresSection";
import { SourceFailures } from "./SourceFailures";
import { TodayHeader } from "./TodayHeader";
import { WorthDoingNext } from "./WorthDoingNext";

/**
 * Today: the briefing, a verdict per product and area, what's worth doing next, and the
 * housekeeping notices (paid spend, backups, data sources) behind the scenes.
 */
export function TodayView({
  today,
  costMeter,
  backup,
  now,
  timeZone,
  locale,
}: {
  today: TodaySummary;
  /** Real spend even on the sample Today: the ledger is never sample data. */
  costMeter: CostMeterView;
  /** Real backup health even on the sample Today: shown only when it needs a look. */
  backup: Pick<BackupStatus, "health" | "lastFailure" | "enabled" | "next">;
  now: Date;
  timeZone: string;
  locale: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <RefreshWhileScanning active={today.scanning} />
      <TodayHeader
        now={now}
        timeZone={timeZone}
        locale={locale}
        scannedAt={today.scannedAt}
        scanning={today.scanning}
        lastFailedAt={today.lastFailedAt}
        briefing={today.briefing}
        isSample={today.isSample}
      />
      {today.isSample && <SampleBanner />}
      <ScoresSection scores={today.scores} />
      <WorthDoingNext actions={today.actions} more={today.moreActions} />
      <section aria-labelledby="behind-heading" className="flex flex-col gap-3">
        <h2 id="behind-heading" className="font-serif text-xl">
          Behind the scenes
        </h2>
        <CostMeter view={costMeter} now={now} timeZone={timeZone} locale={locale} />
        <BackupNotice backup={backup} timeZone={timeZone} locale={locale} />
        <SourceFailures failures={today.failures} />
      </section>
    </div>
  );
}
```

`components/design/ops-example-data.ts` — rename the meter labels `"No paid sources"` → `"No paid data"`.

`components/design/OpsExamples.tsx` — give the two failed-backup examples their own details names: add `detailsTopic="backup error, failed example"` to the "Today backup notice · failed" `BackupNotice` and `detailsTopic="backup error, backups off example"` to the "failed, nightly backups off" one.

`README.md`:
- replace the Today bullet under `## Features` with:

```markdown
- **Today** — date, when your sites were last checked, a one-sentence briefing (overall health
  and the biggest opportunity, then how many things are worth doing, how many Claude is
  handling and whether anything is broken), a plain verdict per product and area (Found on
  Google, Recommended by AI assistants, Answer-ready: Strong 85+, Good 70–84, Fair 50–69 or
  Needs work under 50, with the score and its change beside it; "What's this?" explains each
  area, and the numbers with a 30-day SEO trend sit under Technical details), **Worth doing
  next** (the top three actions as plain cards: why each matters, its area, how big a job it
  is and who's on it), and **Behind the scenes**: paid spend, backup warnings and any data
  source that failed in the last check, each saying what happened, whether it matters and what
  to do (raw errors under Technical details). Until the first scan finishes it shows clearly
  labelled sample data.
```

- replace the **Cost meter** bullet under `## Features` with:

```markdown
- **Cost meter** — Today shows this month's paid API spend against your monthly budget, with a
  month-end projection, a warning at 80 % and a pause at 100 %. No paid source exists yet, so it
  says "No paid data connected" (see [Costs and budget](#costs-and-budget)).
```
- under `## Costs and budget`, replace the meter table with:

```markdown
| Meter | Meaning |
|---|---|
| No paid data connected — Harbour is using free data only, so nothing is being spent | No paid collector exists (or its keys are missing). With spend earlier this month it reads "No paid data connected · A$1.23 spent this month". |
| Paid data is off until you set a monthly budget — how to set one | A paid source is connected but the budget is 0. |
| A$12.40 of A$60.00 this month · on track for A$31.00 | Spend so far, the budget and a straight-line month-end projection (from the second day of the month). |
| … with "80 % of budget" | You have used at least 80 % of the budget. |
| Budget reached — paid data is paused until 1 Nov. Free checks carry on as normal. | Paid collectors are skipped until the next month starts. |
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components && pnpm typecheck && pnpm lint && pnpm check:files`
Expected: PASS (including `OpsExamples.test.tsx` and the Settings component tests, which render `CostMeter` through `BudgetCard`).

- [ ] **Step 5: Commit**

```bash
git add components/today components/design/OpsExamples.tsx components/design/ops-example-data.ts tests/e2e/settings.spec.ts README.md
git commit -m "$(cat <<'EOF'
feat(today): calm notices, behind the scenes

Backup, data source and cost notices each say what happened, whether it
matters and what to do, with raw errors under Technical details. They sit
together at the end of Today; "paid sources" now reads "paid data".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Today on `/design`, the plain-language smoke test, and full verification

**Files:**
- Create: `components/design/today-example-data.ts`, `components/design/TodayExamples.tsx`; Test: `components/design/TodayExamples.test.tsx`
- Modify: `app/(app)/design/page.tsx`
- Create: `tests/e2e/plain-language.ts`
- Modify: `tests/e2e/shell.spec.ts`, `tests/e2e/scans.spec.ts`, `components/today/TodayView.test.tsx`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `exampleToday(product: Pick<Product, "id" | "name">): { briefing: Briefing; scores: ProductScores[]; actions: ActionPreview[] }`; `TodayExamples(props: { product: Pick<Product, "id" | "name"> })`; `expectPlainLanguage(page: Page): Promise<void>` for e2e specs (steps 3–5 reuse it on Actions, Product and Settings).

- [ ] **Step 1: Write the failing tests**

`components/design/TodayExamples.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { getProducts } from "@/lib/products/catalog";
import { TodayExamples } from "./TodayExamples";

describe("TodayExamples", () => {
  it("shows the briefing, the verdict table and a card per who's on it, under the page's heading", () => {
    const [product] = getProducts();
    if (!product) throw new Error("the example config lists products");
    render(<TodayExamples product={product} />);
    expect(screen.queryAllByRole("heading", { level: 1 })).toEqual([]);
    expect(screen.queryAllByRole("heading", { level: 2 })).toEqual([]);
    expect(
      screen.getAllByRole("heading", { level: 3, name: /^Your site is in fair shape\./ }),
    ).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Scores by product" })).toBeInTheDocument();
    for (const phrase of ["Claude is on it", "Pull request waiting for your OK", "Waiting for you"]) {
      expect(screen.getAllByText(phrase).length).toBeGreaterThan(0);
    }
  });
});
```

`components/today/TodayView.test.tsx` — add:

```ts
  it.each([
    ["real", real],
    ["sample", sampleToday(getProducts())],
  ])("speaks plainly on the %s Today: no codes outside Technical details", (_label, today) => {
    const { container } = renderToday(today, EXAMPLE_BACKUPS.failed);
    const copy = container.cloneNode(true);
    if (!(copy instanceof HTMLElement)) throw new Error("not an element");
    for (const details of copy.querySelectorAll("details")) details.remove();
    const text = copy.textContent ?? "";
    expect(text).not.toMatch(/\b(?:SEO|GEO|AEO)\b/);
    expect(text).not.toMatch(/HARBOUR_[A-Z_]+/);
    expect(text).not.toMatch(/\b(?:seo|geo|aeo)\.[a-zA-Z]/);
  });
```

`tests/e2e/plain-language.ts`:

```ts
import { expect, type Page } from "@playwright/test";

/** The main region's text with every <details> (Technical details) left out. */
function textOutsideDetails(page: Page): Promise<string> {
  return page.getByRole("main").evaluate((main) => {
    const copy = main.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return "";
    for (const details of copy.querySelectorAll("details")) details.remove();
    return copy.textContent ?? "";
  });
}

/**
 * Spec §7's smoke check: no area code as a heading, and no setting names or sub-score keys
 * outside Technical details.
 */
export async function expectPlainLanguage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^(SEO|GEO|AEO)$/ })).toHaveCount(0);
  const text = await textOutsideDetails(page);
  expect(text).not.toMatch(/HARBOUR_[A-Z_]+/);
  expect(text).not.toMatch(/\b(?:seo|geo|aeo)\.[a-zA-Z]/);
}
```

`tests/e2e/shell.spec.ts` — add `import { expectPlainLanguage } from "./plain-language";`; in the light/dark Today test, rename it to "Today renders the briefing, verdicts and what's worth doing" and add `await expectPlainLanguage(page);` before `await page.waitForLoadState("networkidle");`; in the light/dark design test add `"Today examples"` to the list of headings.

`tests/e2e/scans.spec.ts` — add `import { expectPlainLanguage } from "./plain-language";` and, in the Today test from Task 18, right after `await expect(page.getByText("Sample data")).toHaveCount(0);`:

```ts
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Your sites (are in (strong|good|fair) shape|need some work)\. Biggest opportunity: (Found on Google|Recommended by AI assistants|Answer-ready) for Acme Docs \((strong|good|fair|needs work)\)\.$/,
  );
  await expect(page.getByText(/^\d+ things? worth doing · nothing is broken$/)).toBeVisible();
  await expectPlainLanguage(page);
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm exec vitest run components/design/TodayExamples.test.tsx components/today/TodayView.test.tsx`
Expected: FAIL — `./TodayExamples` is missing (the TodayView smoke test already passes: Tasks 16–19 left no code outside Technical details; it now guards that).

- [ ] **Step 3: Write minimal implementation**

`components/design/today-example-data.ts`:

```ts
// Fictional Today data for /design, built around a configured product so its links resolve.
import { type Briefing, buildBriefing } from "@/lib/explain/briefing";
import type { Product } from "@/lib/products/catalog";
import type { ActionPreview, ProductScores } from "@/lib/today/types";

export type ExampleToday = { briefing: Briefing; scores: ProductScores[]; actions: ActionPreview[] };

/** One product's example Today: a partial score, a gap, and a card for each "who's on it". */
export function exampleToday(product: Pick<Product, "id" | "name">): ExampleToday {
  const scores: ProductScores[] = [
    {
      productId: product.id,
      scanned: true,
      totals: { seo: 78, geo: 46, aeo: null },
      complete: { seo: true, geo: false, aeo: false },
      deltas: { seo: 2, geo: -1, aeo: null },
      trend: [74, 76, 78],
    },
  ];
  const actions: ActionPreview[] = [
    {
      id: "example-claude",
      productId: product.id,
      area: "GEO",
      impact: "high",
      effort: "small",
      title: "Let AI search crawlers read your site",
      reason: "Assistants can't recommend pages they aren't allowed to read.",
      who: "claude",
      href: null,
    },
    {
      id: "example-pr",
      productId: product.id,
      area: "SEO",
      impact: "medium",
      effort: "medium",
      title: "Give every page its own title",
      reason: "Google uses the title as the headline of each result.",
      who: "pr_waiting",
      href: null,
    },
    {
      id: "example-you",
      productId: product.id,
      area: "AEO",
      impact: "low",
      effort: "large",
      title: "Answer common questions near the top of each guide",
      reason: "Short answers under a question are the ones Google and AI assistants quote.",
      who: "you",
      href: null,
    },
  ];
  const work = actions.map((a) => ({ productId: a.productId, area: a.area, who: a.who }));
  const briefing = buildBriefing({ products: [product], scores, work, failures: [] });
  return { briefing, scores, actions };
}
```

`components/design/TodayExamples.tsx`:

```tsx
import { ActionCard } from "@/components/today/ActionCard";
import { BriefingText } from "@/components/today/BriefingText";
import { VerdictTable } from "@/components/today/VerdictTable";
import { WHO_PHRASE } from "@/lib/explain/actions";
import type { Product } from "@/lib/products/catalog";
import { Example } from "./Example";
import { exampleToday } from "./today-example-data";

/** Fictional Today pieces: the briefing, the verdict table and a card for each "who's on it". */
export function TodayExamples({ product }: { product: Pick<Product, "id" | "name"> }) {
  const today = exampleToday(product);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-ink-muted">Illustrative briefing, verdicts and actions.</p>
      <Example label="Briefing">
        <BriefingText briefing={today.briefing} isSample={false} level={3} />
      </Example>
      <Example label="Briefing · sample data">
        <BriefingText briefing={today.briefing} isSample level={3} />
      </Example>
      <Example label="Scores by product · a partial score and a gap">
        <VerdictTable scores={today.scores} />
      </Example>
      {today.actions.map((action) => (
        <Example
          key={action.id}
          label={`Worth doing next · ${action.who ? WHO_PHRASE[action.who] : "no one on it"}`}
        >
          <ActionCard action={action} />
        </Example>
      ))}
    </div>
  );
}
```

`app/(app)/design/page.tsx` — add `import { TodayExamples } from "@/components/design/TodayExamples";`; in `DesignPage`, add `const [firstProduct] = getProducts();` after `await requireSession();`; and after the "Plain-language examples" section add:

```tsx
      <Section title="Today examples">
        {firstProduct && <TodayExamples product={firstProduct} />}
      </Section>
```

`README.md` — in `## Testing`, after the paragraph that begins "It also serves the fictional Acme Docs fixture site", add this paragraph:

```markdown
The shell and scans specs also check that Today speaks plainly: no SEO, GEO or AEO heading, and
no `HARBOUR_*` setting name or sub-score key outside **Technical details**
(`tests/e2e/plain-language.ts`).
```

- [ ] **Step 4: Run the full checks**

Run: `source ~/.nvm/nvm.sh && pnpm check`
Expected: typecheck, Biome, file sizes, private-data scan and every unit test pass (exit code 0). `pnpm check:files` reports no file over a hard limit; `TodayView.test.tsx` stays under 400 lines.

Run: `source ~/.nvm/nvm.sh && pnpm test:e2e`
Expected: every project passes (chromium, agents, scans, actions, analyst, operations), light and dark.

Run: `grep -rn "Calm waters\|Worth your attention\|No paid sources connected\|headlineFor\|activeImpactCounts" app components lib tests README.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/design/today-example-data.ts components/design/TodayExamples.tsx components/design/TodayExamples.test.tsx "app/(app)/design/page.tsx" tests/e2e/plain-language.ts tests/e2e/shell.spec.ts tests/e2e/scans.spec.ts components/today/TodayView.test.tsx README.md
git commit -m "$(cat <<'EOF'
test(today): plain-language smoke test; Today pieces on /design

Unit and e2e checks that Today shows no area codes, setting names or
sub-score keys outside Technical details, and /design shows the briefing,
verdict table and each "who's on it" card in light and dark.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Steps 3–6 (separate future plans, not part of this one)

Each is its own reviewed change with its own plan, written when the step before it has landed.

### Step 3 — Actions board (plan later)

- Rename the columns and filters with `STATUS_COLUMN`; impact groups and card tags use `IMPACT_PHRASE` / `EFFORT_PHRASE` (retire `IMPACT_LABEL`, `EFFORT_LABEL` and `STATUS_LABEL` from `components/actions/action-labels.ts`, including `components/products/IssueItem.tsx`).
- Each card leads with the plain title, `firstSentence(why)`, effort and impact phrases, who's on it (reuse `activeWork`/`whoIsOnIt`, extended to suggested actions) and the PR link.
- Evidence, source, rule key, history and the Hand to Claude prompt move behind `<TechnicalDetails>`; empty columns use `<EmptyState>` instead of `EMPTY_MESSAGE` literals.
- E2E: `expectPlainLanguage` on `/actions`; keyboard path through a card with the details closed and open.

### Step 4 — Product page (plan later)

- Three area cards (`<VerdictLine>` + `<Explainer>`) and a one-line summary replace `ScoreTiles`' "Search engines / AI assistants / Direct answers" names.
- Each area tab lists sub-scores weakest first as `subScoreLine()` sentences with `subScoreExplanation()` explainers; weights, keys and raw evidence go behind `<TechnicalDetails>`.
- Keyword, pages, issues and question-matrix tables move behind Technical details or "See all …" links, with plain column headers.
- E2E: update `tests/e2e/scans.spec.ts`' score-tile and breakdown assertions; `expectPlainLanguage` on the product page.

### Step 5 — Settings, Agents and messages (plan later)

- Each section opens with one line on what it is for; key and source status read `sourceStatusPhrase()` ("Connected" / "Not connected yet") followed by `SOURCES[].connect` steps — the only place `HARBOUR_*` names appear.
- Sweep every user-facing error, notice and empty state (Sources, Devices, Agents panels, brain sync, proposals) to "what happened, does it matter, what do I do", moving strings beside their component or into `lib/explain/`.
- E2E: `expectPlainLanguage` on Settings, Sources and Agents; update `tests/e2e/settings.spec.ts` status wording.

### Step 6 — Scoring v2: Preferred Sources (plan later)

- Optional `kind: "news" | "product"` (default `"product"`) on products, validated with zod in `lib/products/config.ts`; documented in the README and `harbour.config.example.json`.
- AEO formula v2: for product sites `aeo.preferredSources` scores freshness only; news sites keep v1. Bump `FORMULA_VERSION` to `v2`; history shows "Scoring updated: Preferred Sources now only counts for news sites." at the first v2 score.
- The `no-preferred-sources` rule fires only for news products; open rule actions close through the normal rule sync.
- Update `lib/explain/subscores/aeo.ts` (name, parts and `summarise` for the freshness-only evidence) in the same change; the completeness test keeps it honest.
