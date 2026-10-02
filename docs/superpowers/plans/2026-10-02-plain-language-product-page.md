# Plain-language UX (step 4: the Product page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Product page opens with three area cards (Found on Google, Recommended by AI assistants, Answer-ready: a verdict, the small number and "What's this?") and a one-line summary. Each area tab lists its sub-scores as plain sentences, weakest first, each with an explainer. Issues, pages and Search Console numbers keep their detail behind Technical details with plain column headers. The source panels, the scan status and the Scan now messages use the `lib/explain/sources` phrases. Every scan rule gets a plain card title, so the Actions board, Today and this page stop showing "robots.txt blocks GPTBot" and "No llms.txt".

**Architecture:** Same pattern as steps 1 to 3. Fixed words live in `lib/explain/` (pure) and beside the components; the components compose the step 1 pieces (`VerdictLine`, `Explainer`, `TechnicalDetails`, `EmptyState`, `subScoreLine`, `subScoreExplanation`, `SOURCES`, `AREAS`). The rule titles are rewritten where the rules are defined (`lib/scan/issue-rules.ts`), pinned by a test; stored actions pick the new title up through the existing rule-sync refresh on the next scan. No schema, stored value, URL, API or scoring change.

**Tech Stack:** existing stack only (Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 semantic tokens, Drizzle/SQLite, Vitest + Testing Library (`fireEvent`; no user-event), Playwright, Biome, pnpm). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§3 vocabulary, §5.2 Product page, §5.5 Messages, §2 principles; §8 step 4). **Rules:** `AGENTS.md`. **Builds on:** `docs/superpowers/plans/2026-10-02-plain-language-ux.md` (steps 1 and 2) and `docs/superpowers/plans/2026-10-02-plain-language-actions.md` (step 3).

**Already built, reused here (do not recreate):**

- `components/explain/`: `VerdictLine` (area, score, delta, complete, missingReason, compact), `Explainer` (topic, oneLiner, parts, nextStep), `TechnicalDetails` (id, topic, children; closed by default, remembered per `id`), `EmptyState` (what, when, why).
- `lib/explain/`: `AREAS`, `AREA_ORDER`, `areaKeyOf`, `areaNextStep` (areas.ts); `verdictFor`, `GAP_REASONS`, `trendPhrase` (verdict.ts); `subScoreExplanation(key)` (name, parts, summarise), `subScoreLine(entry)` and `missingLine` (subscores/); `SOURCES`, `sourceName`, `sourceStatusPhrase`, `sourceTrouble` (sources.ts); `IMPACT_PHRASE`, `EFFORT_PHRASE`, `STATUS_COLUMN` (actions.ts).

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
- Area names: "SEO | **Found on Google**", "GEO | **Recommended by AI assistants**", "AEO | **Answer-ready**". "Codes appear only in Technical details and in the Second Brain research."
- Verdict bands: "≥ 85 Strong; 70–84 Good; 50–69 Fair; < 50 Needs work". "When data is missing, the verdict line says so ("speed data still arriving", "not connected yet") instead of implying a worse score. Missing data is a gap, never a zero (AGENTS.md)."
- Wording: "collectors → data sources", "paid sources → paid data", "impact high/medium/low → Big win / Worth doing / Small win", "effort small/medium/large → quick job / an afternoon / a project".
- §5.2: "Opens with three area cards (`<VerdictLine>` plus `<Explainer>`) and a one-line summary." "Each area tab lists its sub-scores as plain sentences with explainers, ordered weakest first." "Keyword, pages, issues and question-matrix tables move behind Technical details or a "See all …" link. Their column headers get plain names."
- §5.5: "Every user-facing error, notice and empty state is rewritten per principle 4. Messages live beside their component or in `lib/explain/`, not scattered as inline literals across files."
- `<TechnicalDetails>`: "a native `<details>` element, closed by default. It remembers the owner's choice per section in localStorage, wrapped in try/catch, and is never required."
- "Each component works in light and dark, uses semantic tokens only, is fully keyboard-accessible, and appears on `/design`."
- E2E smoke: "no raw codes appear outside Technical details: no `SEO|GEO|AEO` as a heading, no `HARBOUR_[A-Z_]+`, no `geo.` or `aeo.` keys."

**From AGENTS.md**

- File size: "React components (`*.tsx`) | 200 lines | 300 lines", "Other TypeScript (`*.ts`) | 300 lines | 400 lines", "Tests | 400 lines | 600 lines", "CSS / tokens | 300 lines | 500 lines". "**Hard limit:** never commit a file over it."
- "Components use **semantic tokens only** (`--surface`, `--ink`, `--accent`…). Never hardcode colours, and never reference primitive palette tokens directly in components."
- "Text sizes in rem via the type scale; no arbitrary px font sizes."
- "Accessibility is part of done: accessible names, visible focus, full keyboard path, one owner per interactive label."
- "A caught failure is recorded or propagated — never logged and turned into success or an empty result. Missing data is a gap, never a zero."
- "`lib/scan/scoring/*` is pure (no I/O) and versioned"; "`app/` routes stay thin: parse input, call `lib/`, render. No business logic."
- "**Types are strict.** `strict: true`, no `any`, no non-null `!` without a comment explaining why it is safe." (Biome errors on `!`, tests included: guard instead.)
- "**No dead code.**" "**No duplication of logic.** Second copy → extract a shared helper." "**Functions stay small** (aim < 40 lines)." "**Comments explain why**, not what. Public functions get a one-line doc comment."
- "Tests bind the real production code path, not test-only copies." "New logic ships with tests; bug fixes ship with a regression test that fails without the fix." "No paid API calls in tests — use recorded fixtures."
- "This repo is public. Never commit personal data… Use fictional examples (`example.com`, `owner@example.com`)." Fixtures here use Acme Docs (`https://docs.example.com`), Lighthouse Café and `example` repositories.
- README: "**Update it in the same change** whenever you add or change a feature…" (Task 9).
- "Small, focused commits with a clear message (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)." Every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use the line of the model that is actually executing the task). Never `--no-verify`.
- "Run `pnpm check` (typecheck, lint, format, size, tests) before committing."

**Environment**

- Node 22: prefix every command with `source ~/.nvm/nvm.sh &&`.
- Next.js 16 has breaking changes. This plan adds no new Next APIs: it uses `next/link`, `"use client"` components (props must be serialisable) and server components as already used in `components/products/`. If a step touches anything else, read the matching guide in `node_modules/next/dist/docs/` first.
- Code blocks may run past Biome's 100-column width: run `pnpm fix` before `pnpm lint` in every task.
- `lib/explain/**` may import **values** only from `lib/explain/**`, `lib/scan/labels.ts` and `lib/scan/scoring/sub-score.ts`; everything else is `import type` only, so client components never bundle the database layer.
- E2E (`pnpm test:e2e`) is slow (the scan spec waits for a real scan). Tasks 1 to 7 edit the e2e assertions that their change breaks, in the same commit, and run only `pnpm check`; Task 8 runs the whole e2e suite once and fixes anything missed.

## Review Focus

Inputs the spec implies that are most likely to bite the owner; each has a pinned test in the task named.

1. **A missing score or sub-score.** A product never scanned, a failed first scan, or an area whose data didn't arrive shows "No score yet" with the reason (never "Needs work", never 0); a sub-score without a number reads "Not counted yet" with `missingLine`'s reason and sorts last, not first. Tests: Tasks 2, 3.
2. **Stored evidence in an older wording.** A breakdown entry whose evidence the current `summarise` can't read, or whose key the formula no longer has, still renders a plain sentence (the verdict's, or the stored label) and no explainer. Test: Task 3.
3. **Raw errors and setting names.** A failed scan's job error, a collector's raw error, and "HARBOUR_GSC_CREDENTIALS is not set" appear only inside Technical details; the visible sentence says what happened, whether it matters and what to do. Tests: Tasks 6, 7, plus the e2e smoke in Task 8.
4. **Stored rule actions keep their old titles until the next scan.** The refresh rewrites title and title key for every action whose issue is still present, whatever its status (including dismissed and snoozed); an already-resolved action keeps its old title. Tests: Task 1 (store), Task 9 (README says so).
5. **"Hand to Claude" behind a closed disclosure.** The button must stay reachable by keyboard (Technical details summary, then the button) and keep its per-issue accessible name. Tests: Task 4 (component), Task 8 (keyboard e2e).
6. **A big crawl and an empty one.** Zero pages shows an empty state that says when pages will appear; more than 50 pages says the table lists the most troubled, and the summary says "at least" rather than undercounting. Test: Task 5.

## Decisions (spec ambiguities resolved here)

1. **"Weakest first" with missing data.** Scored sub-scores sort ascending (ties keep formula order); sub-scores with no number come last. A gap is not "weak": putting it first would imply a worse score than the data supports (spec §3).
2. **The one-line summary.** Built by a pure `productSummary(name, totals)` from the same rules as Today's briefing (verdict of the rounded mean of the scored areas; the shared `averageScore` helper replaces the mean inside `briefing.ts`). Form: "Acme Docs is in fair shape. Weakest: Answer-ready (needs work)." The "Weakest" part appears only with two or more scored areas and a weakest that isn't Strong; "Some scores are still missing data." appears when any area has no score; with none: "Harbour hasn't scored Acme Docs yet, so there's no verdict."
3. **Cards and tabs.** The three cards are not tabs: they sit above the existing tab list, which is relabelled with the plain area names (the tab list keeps its accessible name "Score breakdown"). The card carries the verdict and the area's four-part explainer; the tab carries the sub-scores. The old `ScoreTiles` (and its "Search engines" / "AI assistants" / "Direct answers" names, the codes and the bar) is deleted, and the e2e assertions on it change in the same task.
4. **Tables.** Keyword and page tables go behind `<TechnicalDetails>` with a visible one-sentence summary above them. Issues are not hidden: they are the page's "what to do" and are already plain cards, so the section stays visible as **What to fix** (renamed from "Issues"), and each card's fix text, done-when, locations and Hand to Claude fold into one Technical details section, exactly as step 3 did on the board. No "See all" link is needed: a product has at most eight rules. There is **no question-matrix table on the Product page yet** (the AI engine and Rankings panels are placeholders until the paid collectors exist); when it ships it goes behind Technical details by the same rule. This plan gives its placeholders plain wording and nothing more.
5. **No PageSpeed panel exists** on the Product page today, and none is added (YAGNI): speed appears as the "Speed on phones" sub-score, whose missing reason already comes from `missingLine`, and as a failed data source in the scan status note via `sourceStatusPhrase("pagespeed", "failed")`.
6. **Source panel wording.** Panel titles and status words come from `lib/explain/sources` (`sourceName`, `sourceStatusPhrase`); a paid source reads "Not available yet", not "Not connected (needs API keys)". Search Console's failure reason and "not set" reasons are raw setting text, so they move inside Technical details.
7. **Scan vocabulary.** The button stays **Scan now** and the word "scan" stays on this page (Today says "check"; unifying the word is a Settings/Agents (step 5) decision, since `pnpm scan:now`, the API and Settings all say scan). Only the sentences around it are rewritten. Flagged for the owner.
8. **Rule titles** are rewritten (Task 1) with the wording written out there for the owner to edit. `fix` and `check` stay exact and technical, as in step 3. Rule keys (`missing-title`, …) are unchanged, and so is `no-preferred-sources`'s behaviour (spec §6 gates it later, in step 6).
9. **Page table words.** `lib/scan/page-rows.ts` already shapes what the Pages table shows; its problem labels become plain there ("Missing title", "No main heading", "Hidden from search"), and the Status column becomes "Result" ("Loaded (200)", "Not found (404)") via `pageResult`.
10. **`ScoreBar`, `ScoreValue`, `Delta`** stay: Today's score table and `/design` still use them.

## File Structure

```
lib/explain/
  verdict.ts (+test)          + averageScore, gapReason
  briefing.ts                 uses averageScore
  product-summary.ts (+test)  NEW  productSummary
  pages.ts (+test)            NEW  pageResult, pagesSummary
  scan-status.ts (+test)      NEW  scan sentences and Scan now messages
  search-console.ts (+test)   NEW  searchSummarySentence
  sources.ts                  + sourceExplanation
  subscores/index.ts (+test)  + weakestFirst
lib/scan/
  issue-rules.ts              plain card titles
  issue-rules-plain.test.ts   + titles
  page-rows.ts (+test)        plain problem labels
components/products/
  AreaCards.tsx (+test)       NEW (replaces ScoreTiles.tsx, deleted)
  ProductHeader.tsx           summary + AreaCards
  ProductOverview.tsx         plain tab names and headings
  ScoreBreakdown.tsx (+test)  plain sentences, weakest first, numbers under Technical details
  SubScoreRow.tsx             NEW one sub-score
  IssueList.tsx / IssueItem.tsx (+test)   "What to fix", technical parts folded
  PagesTable.tsx (+test)      behind Technical details, plain headers
  SourcePanel.tsx             caller-supplied status label
  SearchConsolePanel.tsx (+test), SearchConsoleNumbers.tsx (NEW)
  PaidSourcePanels.tsx
  ScanStatusNote.tsx (+test), ScanNowButton.tsx (+test)
components/today/VerdictTable.tsx   uses gapReason
components/design/ScanExamples.tsx  plain tabs, AreaCards, plain pages rows
tests/e2e/scans.spec.ts, actions.spec.ts, plain-language.ts
README.md, docs/superpowers/specs/2026-10-02-plain-language-ux-design.md (§5.2 as built)
```

---

### Task 1: Plain titles for every scan rule

**Files:**
- Modify: `lib/scan/issue-rules.ts` (titles; delete the now-unused `list` helper)
- Modify: `lib/scan/issue-rules-plain.test.ts`, `lib/scan/issues.test.ts`, `lib/actions/rule-sync-store.test.ts`, `components/products/ProductOverview.test.tsx`
- Modify: `tests/e2e/actions.spec.ts`, `tests/e2e/scans.spec.ts`

**Interfaces:**
- Produces: the same `Issue.title` field, with new text. Rule ids, locations, `problem`, `fix` and `check` are unchanged.

**The wording (for the owner to approve or edit).** Counts keep the existing `count(n, one, many)` helper, so "1 page" and "2 pages" both read correctly.

| Rule id | Old title | New title |
|---|---|---|
| `missing-title` | `N page has / pages have no title` | `N page is / pages are missing a title` |
| `missing-description` | `N page has / pages have no meta description` | `N page has / pages have no summary for search results` |
| `broken-links` | `N linked page is / pages are broken` | `N page you link to / pages you link to can't be found` |
| `noindex` | `N page is / pages are hidden from search` | unchanged (already plain) |
| `ai-crawlers-blocked` (an AI search tool is blocked) | `robots.txt blocks OAI-SearchBot and PerplexityBot` | `AI assistants can't read your site` |
| `ai-crawlers-blocked` (only training crawlers blocked) | `robots.txt blocks GPTBot` | `Your site opts out of AI training` |
| `no-faq-schema` | `No page has FAQ structured data` | `Your questions and answers aren't labelled for Google and AI` |
| `no-llms-txt` | `No llms.txt` | `No guide to your site for AI assistants` |
| `no-preferred-sources` | `No Google Preferred Sources button` | `No favourite-source link for Google readers` |

The blocked bot names stay in the issue's locations, `fix` text and the board's Technical details, where the owner needs them.

**How stored actions pick up the new titles.** `planRuleSync` turns every outcome where the issue is still present into a `refresh` (or `status`/reopen) change, and `updateActionContent` rewrites `title` and `titleKey` together, never the status. So on the next scan every open, in-progress, snoozed and dismissed action shows its new title. An action already resolved (done, the issue gone) keeps its old title until the issue returns. No migration. The title key's only uniqueness rule is `(productId, ruleKey)`, so a rename cannot collide.

- [ ] **Step 1: Write the failing tests**

In `lib/scan/issue-rules-plain.test.ts`, turn the helper into one that returns issues, keep `problemsWhenBlocked` as a thin wrapper, and add a titles block. Replace the helper and add the new `describe` after the existing one:

```ts
import type { Issue } from "./issues";
// …existing imports stay (ALL_OK, crawlSite, htmlPage, readiness, evaluateRules, AI_RETRIEVAL_AGENTS)

/** Every rule fires: a bare page, a broken link, no llms.txt, no FAQ, one agent blocked. */
function issuesWhenBlocked(agent: string): Issue[] {
  const observations = [
    htmlPage("/", { titleLength: 0, descriptionLength: 0, noindex: true }),
    crawlSite(),
    readiness({
      robotsTxt: { state: "ok", aiCrawlerAccess: { [agent]: "blocked" } },
      llmsTxt: { present: false },
      schema: { pagesChecked: 3, pagesWith: { FAQPage: 0 } },
      preferredSources: { button: false },
    }),
  ];
  return evaluateRules(observations, ALL_OK).flatMap((o) =>
    o.state === "present" ? [o.issue] : [],
  );
}
const problemsWhenBlocked = (agent: string) => issuesWhenBlocked(agent).map((i) => i.problem);
const titlesWhenBlocked = (agent: string) => issuesWhenBlocked(agent).map((i) => i.title);

const TITLE_JARGON =
  /robots\.txt|llms\.txt|noindex|meta |structured data|JSON-LD|schema|Preferred Sources|crawler|\w+Bot\b/i;

describe("rule titles in plain words", () => {
  it("titles every rule without jargon, for both blocked-agent variants", () => {
    for (const agent of [SEARCH_AGENT, TRAINING_ONLY]) {
      const titles = titlesWhenBlocked(agent);
      expect(titles).toHaveLength(8);
      for (const title of titles) expect(title).not.toMatch(TITLE_JARGON);
    }
  });

  it("pins the titles", () => {
    expect(titlesWhenBlocked(SEARCH_AGENT)).toEqual([
      "1 page is missing a title",
      "1 page has no summary for search results",
      "1 page you link to can't be found",
      "1 page is hidden from search",
      "AI assistants can't read your site",
      "Your questions and answers aren't labelled for Google and AI",
      "No guide to your site for AI assistants",
      "No favourite-source link for Google readers",
    ]);
    expect(titlesWhenBlocked(TRAINING_ONLY)[4]).toBe("Your site opts out of AI training");
  });

  it("counts in the plural", () => {
    const titles = evaluateRules(
      [htmlPage("/a", { titleLength: 0 }), htmlPage("/b", { titleLength: 0 }), crawlSite()],
      ALL_OK,
    ).flatMap((o) => (o.state === "present" ? [o.issue.title] : []));
    expect(titles).toContain("2 pages are missing a title");
  });
});
```

(The existing `describe("rule reasons in plain words")` keeps using `problemsWhenBlocked`; delete its old local definition.)

In `lib/actions/rule-sync-store.test.ts`, add inside `describe("syncRuleActions")`:

```ts
  it("gives a stored action its new title on the next scan, even when it is dismissed", () => {
    const db = openTestDb();
    sync(db, [present("no-llms-txt", { title: "No llms.txt" })], "2026-10-02", t1);
    const created = only(db);
    setStatus(db, created.id, "open", "dismissed", { actor: "owner", now: t1 });
    const plain = "No guide to your site for AI assistants";
    sync(db, [present("no-llms-txt", { title: plain })], "2026-10-03", t2);
    expect(only(db)).toMatchObject({
      status: "dismissed",
      title: plain,
      titleKey: "no guide to your site for ai assistants",
    });
  });
```

This pins the existing refresh behaviour the README will promise; it passes at once.

Update the real-rule assertions that name old titles (run `grep -rn "has no title\|no meta description\|linked page\|robots.txt blocks\|No llms.txt\|FAQ structured data\|Preferred Sources button" lib tests components --include=*.ts --include=*.tsx` and change only those that assert real rule output; fixture strings that merely look like titles, such as `"Add meta descriptions"`, `"2 pages have no title"` inside `rule-sync*.test.ts` and `evidence.test.ts`, stay):

- `lib/scan/issues.test.ts`: lines asserting `"1 linked page is broken"`, `"robots.txt blocks GPTBot"`, the OAI-SearchBot/PerplexityBot title, `"2 pages have no title"` and `"1 page has no meta description"` take the new titles from the table.
- `components/products/ProductOverview.test.tsx`: `"Hand to Claude: 1 linked page is broken"` becomes `"Hand to Claude: 1 page you link to can't be found"`; `issue("linked page is broken")` and `/linked page is broken/` become `"you link to can't be found"`; `issue("blocks GPTBot")` becomes `issue("opts out of AI training")`.
- `tests/e2e/actions.spec.ts` and `tests/e2e/scans.spec.ts` (exact strings, also the header comment): `"1 page has no title"` to `"1 page is missing a title"`; `"1 linked page is broken"` to `"1 page you link to can't be found"`; `"No llms.txt"` to `"No guide to your site for AI assistants"`; `"robots.txt blocks GPTBot"` to `"Your site opts out of AI training"`; `"No page has FAQ structured data"` to `"Your questions and answers aren't labelled for Google and AI"`.

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/scan lib/actions/rule-sync-store.test.ts components/products/ProductOverview.test.tsx`
Expected: FAIL on the old titles (the store test passes).

- [ ] **Step 3: Rewrite the titles**

In `lib/scan/issue-rules.ts`:

```ts
// missingTitle
title: `${count(urls.length, "page is", "pages are")} missing a title`,
// missingDescription
title: `${count(urls.length, "page has", "pages have")} no summary for search results`,
// brokenLinks
title: `${count(locations.length, "page you link to", "pages you link to")} can't be found`,
// aiCrawlersBlocked
title: search ? "AI assistants can't read your site" : "Your site opts out of AI training",
// noFaqSchema
title: "Your questions and answers aren't labelled for Google and AI",
// noLlmsTxt
title: "No guide to your site for AI assistants",
// noPreferredSources
title: "No favourite-source link for Google readers",
```

`noindex` keeps its title. Delete the `list` function at the top of the file: `aiCrawlersBlocked` was its only caller (the bot names remain in `fix` and in the issue's locations).

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scan lib/actions tests components/products/ProductOverview.test.tsx
git commit -m "feat(scan): plain card titles for every rule

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Three area cards and a one-line summary

**Files:**
- Modify: `lib/explain/verdict.ts`, `lib/explain/verdict.test.ts`, `lib/explain/briefing.ts`, `components/today/VerdictTable.tsx`
- Create: `lib/explain/product-summary.ts`, `lib/explain/product-summary.test.ts`, `components/products/AreaCards.tsx`, `components/products/AreaCards.test.tsx`
- Modify: `components/products/ProductHeader.tsx`, `components/design/ScanExamples.tsx`, `components/products/ProductOverview.test.tsx`, `tests/e2e/scans.spec.ts`
- Delete: `components/products/ScoreTiles.tsx`

**Interfaces:**
- Produces (verdict.ts): `averageScore(values: readonly number[]): number | null` (rounded mean, null when empty); `gapReason(state: { scanned: boolean; lastCheckFailed: boolean }): string` (the sentence behind a missing score: `GAP_REASONS.dataMissing` when scanned, else `checkFailed` when the last check failed, else `notChecked`).
- Produces: `productSummary(name: string, totals: AreaValues<number | null> | null): string`.
- Produces: `<AreaCards scores: ScoreTrend scan: ScanState />`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/explain/verdict.test.ts` (import `averageScore`, `gapReason`):

```ts
describe("averageScore", () => {
  it("rounds the mean and says nothing for no scores", () => {
    expect(averageScore([64, 41])).toBe(53);
    expect(averageScore([85])).toBe(85);
    expect(averageScore([])).toBeNull();
  });
});

describe("gapReason", () => {
  it("tells data that didn't arrive from a failed or missing check", () => {
    expect(gapReason({ scanned: true, lastCheckFailed: true })).toBe(GAP_REASONS.dataMissing);
    expect(gapReason({ scanned: false, lastCheckFailed: true })).toBe(GAP_REASONS.checkFailed);
    expect(gapReason({ scanned: false, lastCheckFailed: false })).toBe(GAP_REASONS.notChecked);
  });
});
```

`lib/explain/product-summary.test.ts`:

```ts
import { productSummary } from "./product-summary";

const totals = (seo: number | null, geo: number | null, aeo: number | null) => ({ seo, geo, aeo });

describe("productSummary", () => {
  it("gives the health verdict and the weakest area", () => {
    expect(productSummary("Acme Docs", totals(64, 41, 52))).toBe(
      "Acme Docs is in fair shape. Weakest: Recommended by AI assistants (needs work).",
    );
  });

  it("says needs some work for a low mean", () => {
    expect(productSummary("Acme Docs", totals(40, 30, 20))).toMatch(/^Acme Docs needs some work\./);
  });

  it("leaves out the weakest area when it is strong or the only one scored", () => {
    expect(productSummary("Acme Docs", totals(90, 88, 86))).toBe("Acme Docs is in strong shape.");
    expect(productSummary("Acme Docs", totals(40, null, null))).toBe(
      "Acme Docs needs some work. Some scores are still missing data.",
    );
  });

  it("flags a partly scored product and never counts a gap as zero", () => {
    expect(productSummary("Acme Docs", totals(80, 80, null))).toBe(
      "Acme Docs is in good shape. Some scores are still missing data.",
    );
  });

  it("gives no verdict without scores", () => {
    const none = "Harbour hasn't scored Acme Docs yet, so there's no verdict.";
    expect(productSummary("Acme Docs", null)).toBe(none);
    expect(productSummary("Acme Docs", totals(null, null, null))).toBe(none);
  });
});
```

`components/products/AreaCards.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ScanState, ScoreTrend } from "@/lib/scan/views";
import { AreaCards } from "./AreaCards";

const AT = new Date("2026-10-01T06:00:00Z");
const noScan: ScanState = { active: null, last: null };
const scored: ScoreTrend = {
  latest: {
    scanId: 1,
    computedAt: AT,
    formulaVersion: "v1",
    totals: { seo: 64, geo: 41, aeo: null },
    complete: { seo: false, geo: true, aeo: false },
    breakdown: [],
  },
  deltas: { seo: 3, geo: null, aeo: null },
  trend: [61, 64],
};
const unscanned: ScoreTrend = {
  latest: null,
  deltas: { seo: null, geo: null, aeo: null },
  trend: [],
};

const card = (name: string) =>
  within(screen.getByRole("list", { name: "Your three scores" })).getAllByRole("listitem").find(
    (li) => li.textContent?.startsWith(name),
  ) as HTMLElement;

describe("AreaCards", () => {
  it("shows each area by its plain name with a verdict, the small number and the trend", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    expect(card("Found on Google")).toHaveTextContent("Fair 64 out of 100");
    expect(card("Found on Google")).toHaveTextContent("up 3 since the last check");
    expect(card("Found on Google")).toHaveTextContent("Some data was missing, so this may change.");
    expect(card("Recommended by AI assistants")).toHaveTextContent("Needs work 41 out of 100");
  });

  it("says why an area has no score instead of showing a zero", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    expect(card("Answer-ready")).toHaveTextContent("No score yet");
    expect(card("Answer-ready")).toHaveTextContent("The data for this didn't arrive.");
    expect(card("Answer-ready")).not.toHaveTextContent(/\b0\b/);
  });

  it("explains a product that was never scanned, or whose first scan failed", () => {
    const { unmount } = render(<AreaCards scores={unscanned} scan={noScan} />);
    expect(card("Found on Google")).toHaveTextContent("Not checked yet.");
    unmount();
    const failed: ScanState = {
      active: null,
      last: {
        scanId: 1,
        status: "failed",
        startedAt: AT,
        finishedAt: AT,
        error: null,
        failedCollectors: [],
      },
    };
    render(<AreaCards scores={unscanned} scan={failed} />);
    expect(card("Found on Google")).toHaveTextContent("The last check didn't finish.");
  });

  it("opens the four-part explainer from the keyboard-reachable button", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    const button = screen.getByRole("button", { name: /What's this\? \(Found on Google\)/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(card("Found on Google")).getByText("Why Harbour checks it")).toBeInTheDocument();
    expect(
      within(card("Found on Google")).getByRole("link", {
        name: "See what's worth doing for Found on Google",
      }),
    ).toHaveAttribute("href", "/actions?area=SEO");
  });

  it("uses no area codes and none of the old tile names", () => {
    render(<AreaCards scores={scored} scan={noScan} />);
    expect(screen.queryByText(/^(SEO|GEO|AEO)$/)).toBeNull();
    for (const old of ["Search engines", "AI assistants", "Direct answers"]) {
      expect(screen.queryByText(old, { exact: true })).toBeNull();
    }
  });
});
```

(`"AI assistants"` as an exact text node does not occur: the plain name is "Recommended by AI assistants".)

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/verdict.test.ts lib/explain/product-summary.test.ts components/products/AreaCards.test.tsx`
Expected: FAIL (modules and exports missing).

- [ ] **Step 3: Implement**

Append to `lib/explain/verdict.ts`:

```ts
/** The mean of the scores, rounded; null when there are none (a gap, never a zero). */
export function averageScore(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Why a score is missing: its data didn't arrive, its check failed, or no check has run. */
export function gapReason(state: { scanned: boolean; lastCheckFailed: boolean }): string {
  if (state.scanned) return GAP_REASONS.dataMissing;
  return state.lastCheckFailed ? GAP_REASONS.checkFailed : GAP_REASONS.notChecked;
}
```

In `components/today/VerdictTable.tsx` delete the local `gapReason` function and its `GAP_REASONS` import, import `gapReason` from `@/lib/explain/verdict`, and change the call site from `gapReason(row)` (unchanged argument: a `ProductScores` row has `scanned` and `lastCheckFailed`).

In `lib/explain/briefing.ts` replace the mean in `health`:

```ts
  const mean = averageScore(values);
  if (mean === null) return "Harbour has no scores yet, so there's no verdict.";
  const one = input.products.length === 1;
```

(remove the `values.length === 0` check and the `reduce`; import `averageScore` with `verdictFor`.)

`lib/explain/product-summary.ts`:

```ts
import type { AreaKey, AreaValues } from "@/lib/scan/views";
import { AREA_ORDER, AREAS } from "./areas";
import { averageScore, verdictFor } from "./verdict";

/**
 * The Product page's one line: the product's health, its weakest area when that is worth naming,
 * and a note when some scores are missing. Same words as Today's briefing; no scores, no verdict.
 */
export function productSummary(name: string, totals: AreaValues<number | null> | null): string {
  const scored = AREA_ORDER.flatMap((key): { key: AreaKey; score: number }[] => {
    const score = totals?.[key] ?? null;
    return score === null ? [] : [{ key, score }];
  });
  const mean = averageScore(scored.map((s) => s.score));
  if (mean === null) return `Harbour hasn't scored ${name} yet, so there's no verdict.`;
  const label = verdictFor(mean).label;
  const parts = [label === "Needs work" ? `${name} needs some work.` : `${name} is in ${label.toLowerCase()} shape.`];
  // Earlier area wins a tie, matching the briefing's opportunity rule.
  const weakest = scored.reduce((low, s) => (s.score < low.score ? s : low));
  const weakestLabel = verdictFor(weakest.score).label;
  if (scored.length > 1 && weakestLabel !== "Strong") {
    parts.push(`Weakest: ${AREAS[weakest.key].name} (${weakestLabel.toLowerCase()}).`);
  }
  if (scored.length < AREA_ORDER.length) parts.push("Some scores are still missing data.");
  return parts.join(" ");
}
```

`components/products/AreaCards.tsx`:

```tsx
import { Explainer } from "@/components/explain/Explainer";
import { VerdictLine } from "@/components/explain/VerdictLine";
import { AREA_ORDER, AREAS, areaNextStep } from "@/lib/explain/areas";
import { gapReason } from "@/lib/explain/verdict";
import type { ScanState, ScoreTrend } from "@/lib/scan/views";

/** The three areas in the owner's words: a verdict first, the number small, and "What's this?". */
export function AreaCards({ scores, scan }: { scores: ScoreTrend; scan: ScanState }) {
  const { latest, deltas } = scores;
  const missingReason = gapReason({
    scanned: latest !== null,
    lastCheckFailed: scan.last?.status === "failed",
  });
  return (
    <ul aria-label="Your three scores" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {AREA_ORDER.map((key) => {
        const area = AREAS[key];
        return (
          <li key={key} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
            <div>
              <VerdictLine
                area={key}
                score={latest?.totals[key] ?? null}
                delta={deltas[key]}
                complete={latest?.complete[key] ?? true}
                missingReason={missingReason}
              />
            </div>
            <Explainer
              topic={area.name}
              oneLiner={area.oneLiner}
              parts={area.parts}
              nextStep={areaNextStep(key)}
            />
          </li>
        );
      })}
    </ul>
  );
}
```

In `ProductHeader.tsx`: import `AreaCards` and `productSummary`; replace `<ScoreTiles scores={scores} />` with

```tsx
      <p className="text-sm text-ink">
        {productSummary(product.name, scores.latest?.totals ?? null)}
      </p>
      <AreaCards scores={scores} scan={scan} />
```

(also update its doc comment: "…and the three area cards".) Delete `components/products/ScoreTiles.tsx`. In `components/design/ScanExamples.tsx` replace the `ScoreTiles` import and element with `<AreaCards scores={EXAMPLE_SCORES} scan={EXAMPLE_SCAN_STATES[0]?.scan ?? { active: null, last: null }} />` (guard instead of `!`).

`components/products/ProductOverview.test.tsx`: in the never-scanned test replace `expect(screen.getAllByText("no score")).toHaveLength(3)` with `expect(screen.getAllByText("No score yet")).toHaveLength(3)`; in "explains scores: tiles, breakdown…" replace the first three lines (`tiles`, `64`, `incomplete`) with:

```tsx
    expect(screen.getByText(/^Acme Docs is in /)).toBeInTheDocument();
    expect(screen.getByText("Found on Google").closest("li")).toHaveTextContent("Fair 64 out of 100");
```

`tests/e2e/scans.spec.ts`: replace the `scoreTile` helper and the tile loop with

```ts
/** An area card in the product header, found by its plain name. */
const areaCard = (page: Page, name: string) =>
  page.getByRole("list", { name: "Your three scores" }).getByRole("listitem").filter({ hasText: name });
```

```ts
  await expect(page.getByText(/^Acme Docs (is in (strong|good|fair) shape|needs some work)\./)).toBeVisible();
  for (const name of ["Found on Google", "Recommended by AI assistants", "Answer-ready"]) {
    await expect(areaCard(page, name)).toContainText(/(Strong|Good|Fair|Needs work) \d+ out of 100/);
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS (the Today briefing and verdict-table tests still pass, since `averageScore` and `gapReason` keep their behaviour).

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(product): the page opens with three plain area cards and a summary

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sub-scores as plain sentences, weakest first

**Files:**
- Modify: `lib/explain/subscores/index.ts`, `lib/explain/subscores/index.test.ts`
- Create: `components/products/SubScoreRow.tsx`, `components/products/ScoreBreakdown.test.tsx`
- Modify: `components/products/ScoreBreakdown.tsx`, `components/products/ProductOverview.tsx`, `components/products/ProductOverview.test.tsx`, `components/design/ScanExamples.tsx`, `tests/e2e/scans.spec.ts`

**Interfaces:**
- Produces: `weakestFirst<T extends { score: number | null }>(entries: readonly T[]): T[]`: ascending score, ties keep order, entries without a number last.
- Consumes: `subScoreExplanation`, `subScoreLine` (subscores/index.ts), `verdictFor`, `AREAS`, `Explainer`, `TechnicalDetails`, `EmptyState`.
- Produces: `<SubScoreRow entry: ScoreBreakdownEntry />`; `<ScoreBreakdown area entries complete />` (same props as today).

- [ ] **Step 1: Write the failing tests**

Append to `lib/explain/subscores/index.test.ts` (import `weakestFirst`):

```ts
describe("weakestFirst", () => {
  it("sorts ascending, keeps ties in order and puts entries without a number last", () => {
    const entries = [
      { key: "a", score: 80 },
      { key: "b", score: null },
      { key: "c", score: 30 },
      { key: "d", score: 80 },
    ];
    expect(weakestFirst(entries).map((e) => e.key)).toEqual(["c", "a", "d", "b"]);
    expect(entries.map((e) => e.key)).toEqual(["a", "b", "c", "d"]);
  });
});
```

`components/products/ScoreBreakdown.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { ScoreBreakdown } from "./ScoreBreakdown";

const entry = (over: Partial<ScoreBreakdownEntry>): ScoreBreakdownEntry => ({
  key: "seo.technical",
  label: "Technical health",
  score: 80,
  weight: 0.35,
  evidence: "6 pages crawled, 6 answered 2xx.",
  status: "ok",
  ...over,
});
const entries = [
  entry({}),
  entry({ key: "seo.indexability", label: "Indexability", score: 35, weight: 0.25, evidence: "Googlebot allowed; No sitemap found" }),
  entry({ key: "seo.cwv", label: "Core Web Vitals", score: null, weight: 0.2, evidence: "PageSpeed is not connected", status: "missing" }),
];

describe("ScoreBreakdown", () => {
  it("lists sub-scores weakest first, with the not-counted one last", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete={false} />);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Google can get in", "Page health", "Speed on phones"]);
  });

  it("says each one as a plain sentence with its verdict, and why a missing one is not counted", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete={false} />);
    expect(screen.getByText("Google is allowed in, but your sitemap is missing or broken.")).toBeInTheDocument();
    expect(screen.getByText("Not counted yet")).toBeInTheDocument();
    expect(screen.getByText("Not connected yet, so it isn't counted.")).toBeInTheDocument();
    expect(screen.getByText(/Parts marked/)).toBeInTheDocument();
  });

  it("gives each sub-score its own explainer button", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete />);
    const button = screen.getByRole("button", { name: /What's this\? \(Page health\)/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: /What's this\?/ })).toHaveLength(3);
  });

  it("keeps codes, weights and raw evidence inside Technical details", () => {
    render(<ScoreBreakdown area="seo" entries={entries} complete />);
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("seo.technical")).toBeInTheDocument();
    expect(within(details).getByText("35%")).toBeInTheDocument();
    expect(within(details).getByText("PageSpeed is not connected")).toBeInTheDocument();
    const visible = document.createElement("div");
    visible.innerHTML = document.body.innerHTML;
    visible.querySelectorAll("details").forEach((d) => d.remove());
    expect(visible.textContent).not.toMatch(/\b(?:seo|geo|aeo)\.[a-z]/i);
  });

  it("reads a sub-score the formula no longer has, or evidence it can't parse, as a plain sentence", () => {
    render(
      <ScoreBreakdown
        area="seo"
        complete
        entries={[
          entry({ key: "seo.legacy", label: "Old measure", score: 75, evidence: "something older" }),
          entry({ key: "seo.technical", score: 55, evidence: "a wording from an older formula" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Old measure" })).toBeInTheDocument();
    expect(screen.getByText("In good shape, with a little room to improve.")).toBeInTheDocument();
    expect(screen.getByText("Working, but there's clear room to improve.")).toBeInTheDocument();
  });

  it("says when there is no breakdown yet", () => {
    render(<ScoreBreakdown area="geo" entries={[]} complete />);
    expect(screen.getByText(/The details behind Recommended by AI assistants/)).toBeInTheDocument();
  });
});
```

Update `ProductOverview.test.tsx`: in "explains scores" replace the panel assertions with

```tsx
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByRole("heading", { name: "Page health" })).toBeInTheDocument();
    expect(within(panel).getByText("Not connected yet, so it isn't counted.")).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed failed: quota exceeded/)).toBeInTheDocument();
```

(the last line is rewritten in Task 7). The test `getByRole("tabpanel")` still finds the one visible panel; the first tab is now named "Found on Google".

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/subscores components/products/ScoreBreakdown.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `lib/explain/subscores/index.ts`:

```ts
const rank = (entry: { score: number | null }) => entry.score ?? Number.POSITIVE_INFINITY;

/**
 * Entries weakest first, so the top one is the best place to start. A sub-score with no number is
 * a gap, not a weak one: it goes last instead of implying a worse score than the data supports.
 */
export function weakestFirst<T extends { score: number | null }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1));
}
```

`components/products/SubScoreRow.tsx`:

```tsx
import { Explainer } from "@/components/explain/Explainer";
import { Tag } from "@/components/ui/Tag";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { subScoreExplanation, subScoreLine } from "@/lib/explain/subscores";
import { verdictFor } from "@/lib/explain/verdict";

/** One sub-score: its plain name and verdict, one plain sentence, and "What's this?". */
export function SubScoreRow({ entry }: { entry: ScoreBreakdownEntry }) {
  const explanation = subScoreExplanation(entry.key);
  const name = explanation?.name ?? entry.label;
  const sentence = subScoreLine(entry);
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-medium text-ink">{name}</h3>
        {entry.score === null ? (
          <Tag tone="neutral">Not counted yet</Tag>
        ) : (
          <span className="text-sm">
            <span className="font-medium">{verdictFor(entry.score).label}</span>{" "}
            <span className="text-xs tabular-nums text-ink-muted">
              {entry.score}
              <span className="sr-only"> out of 100</span>
            </span>
          </span>
        )}
      </div>
      {explanation ? (
        <Explainer topic={name} oneLiner={sentence} parts={explanation.parts} />
      ) : (
        <p className="text-sm text-ink">{sentence}</p>
      )}
    </li>
  );
}
```

`components/products/ScoreBreakdown.tsx` (rewrite):

```tsx
import { EmptyState } from "@/components/explain/EmptyState";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { Panel } from "@/components/ui/Panel";
import type { ScoreBreakdownEntry } from "@/lib/db/schema";
import { AREAS } from "@/lib/explain/areas";
import { weakestFirst } from "@/lib/explain/subscores";
import type { AreaKey } from "@/lib/scan/views";
import { SubScoreRow } from "./SubScoreRow";

const WEAKEST_FIRST = "Weakest first, so the top one is the best place to start.";
const GAPS =
  "Parts marked “Not counted yet” had no data in the last scan, so they are left out, not counted as zero.";

function Numbers({ entries }: { entries: ScoreBreakdownEntry[] }) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Sub-scores in numbers</caption>
      <thead className="text-ink-muted">
        <tr className="border-b border-line">
          {["Sub-score", "Weight", "Score", "What Harbour recorded"].map((name) => (
            <th key={name} scope="col" className="py-1.5 pr-3 font-normal">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {entries.map((entry) => (
          <tr key={entry.key} className="align-top">
            <th scope="row" className="py-1.5 pr-3 font-mono font-normal">
              {entry.key}
            </th>
            <td className="py-1.5 pr-3 tabular-nums">{Math.round(entry.weight * 100)}%</td>
            <td className="py-1.5 pr-3 tabular-nums">{entry.score ?? "none"}</td>
            <td className="py-1.5">{entry.evidence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One area's sub-scores as plain sentences, weakest first, with the numbers, keys and raw
 * evidence under Technical details. Entries come from the stored breakdown, keyed "<area>.<name>".
 */
export function ScoreBreakdown({
  area,
  entries,
  complete,
}: {
  area: AreaKey;
  entries: ScoreBreakdownEntry[];
  complete: boolean;
}) {
  const { name, code } = AREAS[area];
  const own = weakestFirst(entries.filter((entry) => entry.key.startsWith(`${area}.`)));
  if (own.length === 0) {
    return (
      <EmptyState
        what={`The details behind ${name} will appear here.`}
        when="They appear after the first scan finishes."
        why="Each one says what Harbour looked at and how your site did."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">{complete ? WEAKEST_FIRST : `${WEAKEST_FIRST} ${GAPS}`}</p>
      <ul className="divide-y divide-line">
        {own.map((entry) => (
          <SubScoreRow key={entry.key} entry={entry} />
        ))}
      </ul>
      <TechnicalDetails id={`breakdown-${area}`} topic={`${code} scores in numbers`}>
        <Panel className="overflow-x-auto px-3 py-2">
          <Numbers entries={own} />
        </Panel>
      </TechnicalDetails>
    </div>
  );
}
```

(`Panel` is the existing `components/ui/Panel`; if its props differ, a plain `div` with `rounded-md border border-line` is fine.)

`components/products/ProductOverview.tsx`: tabs `label: AREAS[area].name` (import `AREAS`), heading `What's behind each rating`. `components/design/ScanExamples.tsx`: the three tab labels become `AREAS.seo.name`, `AREAS.geo.name`, `AREAS.aeo.name`.

`tests/e2e/scans.spec.ts`: in the first test `page.getByRole("tabpanel", { name: "SEO" })` becomes `"Found on Google"`, the heading `"Technical health"` becomes `"Page health"`, and the "Not connected" line becomes `await expect(breakdown.getByText("Not connected yet, so it isn't counted.").first()).toBeVisible();`. In the keyboard test add `const [SEO, GEO, AEO] = ["Found on Google", "Recommended by AI assistants", "Answer-ready"] as const;` and replace every `tab("SEO")`, `tab("GEO")`, `tab("AEO")` and tabpanel name `"SEO"`/`"GEO"` with the constants; the GEO panel heading `"llms.txt"` becomes `"A guide for AI assistants (llms.txt)"`. (The arrow-key script itself is unchanged.)

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(product): sub-scores as plain sentences, weakest first

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: "What to fix": plain issue cards, the technical parts folded away

**Files:**
- Modify: `components/products/IssueItem.tsx`, `components/products/IssueList.tsx`, `components/products/ProductOverview.test.tsx`, `tests/e2e/scans.spec.ts`
- Create: `components/products/IssueItem.test.tsx`

**Interfaces:**
- Consumes: `AREAS`/`areaKeyOf`, `IMPACT_PHRASE`, `EFFORT_PHRASE`, `STATUS_COLUMN`, `TechnicalDetails`, `EmptyState`.
- Produces: same props for `IssueItem` and `IssueList`; the issue region is named "What to fix".

- [ ] **Step 1: Write the failing test**

`components/products/IssueItem.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Product } from "@/lib/products/catalog";
import { deriveIssues } from "@/lib/scan/issues";
import { ACME_CRAWL, ALL_OK, readiness } from "@/tests/helpers/scoring";
import { IssueItem } from "./IssueItem";

const product: Product = { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" };
// The real rules over Acme Docs' crawl: the first issue is the broken link.
const [broken] = deriveIssues([...ACME_CRAWL, readiness()], ALL_OK);
const issue = (() => {
  if (!broken) throw new Error("expected an issue");
  return broken;
})();

const renderIssue = () =>
  render(
    <IssueItem
      issue={issue}
      action={{ id: 5, status: "in_progress", snoozedUntil: null }}
      product={product}
      locale="en-GB"
    />,
  );

describe("IssueItem", () => {
  it("leads with the plain words: impact, area, effort, status, the title and why it matters", () => {
    renderIssue();
    const card = screen.getByRole("article", { name: "1 page you link to can't be found" });
    for (const text of ["Big win", "Found on Google", "an afternoon", "In progress"]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(within(card).getByText(issue.problem)).toBeInTheDocument();
    expect(within(card).queryByText("SEO")).toBeNull();
  });

  it("folds where, the fix, the check and the hand-off into one Technical details section", () => {
    renderIssue();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(issue.fix)).toBeInTheDocument();
    expect(within(details).getByText(issue.check)).toBeInTheDocument();
    expect(within(details).getByText(/\/missing \(HTTP 404\)/)).toBeInTheDocument();
    // Still reachable (once the section is open) under its own per-issue name.
    expect(
      within(details).getByRole("button", { name: `Hand to Claude: ${issue.title}` }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("details details")).toHaveLength(0);
  });

  it("keeps the link to the card on the Actions board outside the fold", () => {
    renderIssue();
    const link = screen.getByRole("link", { name: "View on the Actions board" });
    expect(link).toHaveAttribute("href", "/actions?product=acme-docs&status=all#action-5");
    expect(link.closest("details")).toBeNull();
  });
});
```

Also in `ProductOverview.test.tsx` change `screen.getByRole("region", { name: "Issues" })` to `{ name: "What to fix" }`, the empty-state expectation `"Issues appear after the first scan."` to `/Problems Harbour finds will be listed here\./`, and the pages test lines that need `Technical details` open are handled in Task 5.

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run components/products`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/products/IssueItem.tsx`: add imports `TechnicalDetails`, `AREAS`/`areaKeyOf`, `EFFORT_PHRASE`; change the tag row and replace the `Where` `<details>`, the `<dl>` and the `CopyPromptButton` placement:

```tsx
      <div className="flex flex-wrap gap-1.5">
        <Tag tone={issue.impact === "high" ? "warn" : "neutral"}>{IMPACT_PHRASE[issue.impact]}</Tag>
        <Tag tone="accent">{AREAS[areaKeyOf(issue.area)].name}</Tag>
        <Tag tone="neutral">{EFFORT_PHRASE[issue.effort]}</Tag>
        <Tag tone={action?.status === "done" ? "warn" : "neutral"}>
          {actionStatusText(action, locale)}
        </Tag>
      </div>
      <h3 id={headingId} className="text-sm font-medium text-ink">
        {issue.title}
      </h3>
      <p className="text-sm text-ink-muted">{issue.problem}</p>
      {action && (/* the existing "View on the Actions board" <p><Link …/></p>, unchanged */)}
      <TechnicalDetails id="issue-card" topic="where it was found, the fix and the hand-off to Claude">
        <div className="flex flex-col gap-2">
          <p className="text-ink-muted">{issue.total === 1 ? "Where" : `Where (${issue.total})`}</p>
          <ul className="flex flex-col gap-0.5 break-all font-mono text-ink-muted">
            {issue.locations.map((location) => (
              <li key={location}>{location}</li>
            ))}
            {more > 0 && <li>…and {more} more</li>}
          </ul>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-muted">Fix</dt>
            <dd>{issue.fix}</dd>
            <dt className="text-ink-muted">Done when</dt>
            <dd>{issue.check}</dd>
          </dl>
          <CopyPromptButton prompt={handoffPrompt(product, issue)} title={issue.title} />
        </div>
      </TechnicalDetails>
```

All cards share one remembered open/closed choice (`id="issue-card"`), as on the board.

`components/products/IssueList.tsx`: heading `What to fix`; add a line under it, `<p className="text-sm text-ink-muted">Each problem says why it matters. The same list is on the Actions board, where you can track it.</p>`; replace the two bare `<p>` empties with `EmptyState`:

```tsx
const NONE_FOUND = {
  what: "No problems found in the last scan.",
  when: "Harbour checks again with every scan.",
  why: "Anything new it finds appears here and on the Actions board.",
};
const NOT_SCANNED = {
  what: "Problems Harbour finds will be listed here.",
  when: "They appear after the first scan finishes.",
  why: "Each comes with what to do about it and how to tell it's fixed.",
};
// …
{issues.length === 0 ? <EmptyState {...(scanned ? NONE_FOUND : NOT_SCANNED)} /> : (<Panel …>)}
```

(`aria-labelledby="issues-heading"`, `id="issues"` keep: other pages link to `#issues`.)

`tests/e2e/scans.spec.ts` (first test): `page.getByRole("region", { name: "Issues" })` becomes `{ name: "What to fix" }`; the two `await x.getByText("Where").click()` lines become `await x.getByText("Technical details").click()`.

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components tests
git commit -m "feat(product): What to fix, in plain words with the technical parts folded away

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pages behind Technical details, with plain headers

**Files:**
- Create: `lib/explain/pages.ts`, `lib/explain/pages.test.ts`, `components/products/PagesTable.test.tsx`
- Modify: `lib/scan/page-rows.ts`, `lib/scan/page-rows.test.ts`, `components/products/PagesTable.tsx`, `components/design/ScanExamples.tsx`, `components/products/ProductOverview.test.tsx`, `tests/e2e/scans.spec.ts`

**Interfaces:**
- Produces: `pageResult(status: number): string`; `pagesSummary(rows: readonly { problems: readonly string[] }[], total: number): string`.
- Changes `PageRow.problems` wording (type unchanged).

- [ ] **Step 1: Write the failing tests**

`lib/explain/pages.test.ts`:

```ts
import { pageResult, pagesSummary } from "./pages";

describe("pageResult", () => {
  it.each([
    [200, "Loaded (200)"],
    [301, "Moved (301)"],
    [404, "Not found (404)"],
    [403, "Refused (403)"],
    [503, "Server error (503)"],
    [0, "No proper answer (0)"],
  ] as const)("reads %d as %s", (status, text) => {
    expect(pageResult(status)).toBe(text);
  });
});

describe("pagesSummary", () => {
  const row = (n: number) => ({ problems: Array.from({ length: n }, () => "x") });
  it("counts the pages with something to fix", () => {
    expect(pagesSummary([row(1), row(0), row(2)], 3)).toBe(
      "Harbour checked 3 pages. 2 have something to fix.",
    );
    expect(pagesSummary([row(1)], 1)).toBe("Harbour checked 1 page. 1 has something to fix.");
    expect(pagesSummary([row(0)], 1)).toBe("Harbour checked 1 page. Nothing needs fixing.");
  });
  it("says at least when the table is cut off and every listed page has a problem", () => {
    expect(pagesSummary([row(1), row(1)], 80)).toBe(
      "Harbour checked 80 pages. At least 2 have something to fix.",
    );
  });
});
```

In `lib/scan/page-rows.test.ts` update expectations: `["noindex"]` to `["Hidden from search"]`, `["2 h1s"]` to `["2 main headings"]`, `["HTTP 404"]` to `["Didn't load"]`, and the missing-heading test to `["Missing title", "Missing description", "No main heading"]`.

`components/products/PagesTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { PageRow } from "@/lib/scan/page-rows";
import { PagesTable } from "./PagesTable";

const rows: PageRow[] = [
  { url: "https://docs.example.com/old", status: 404, title: null, problems: ["Didn't load"] },
  { url: "https://docs.example.com/", status: 200, title: "Acme Docs", problems: [] },
];

describe("PagesTable", () => {
  it("says in a sentence how many pages need attention and tucks the table into Technical details", () => {
    render(<PagesTable rows={rows} total={2} />);
    expect(screen.getByText("Harbour checked 2 pages. 1 has something to fix.")).toBeInTheDocument();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByRole("table")).toBeInTheDocument();
  });

  it("uses plain column headers and plain results", () => {
    render(<PagesTable rows={rows} total={2} />);
    const names = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(names).toEqual(["Page", "Result", "What to fix"]);
    expect(screen.getByText("Not found (404)")).toBeInTheDocument();
    expect(screen.getByText("Loaded (200)")).toBeInTheDocument();
    expect(screen.getByText("Didn't load")).toBeInTheDocument();
  });

  it("says what will appear before the first scan", () => {
    render(<PagesTable rows={[]} total={0} />);
    expect(screen.getByText(/The pages Harbour checks will be listed here/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when the table lists only the most troubled pages of a big site", () => {
    render(<PagesTable rows={rows} total={120} />);
    expect(screen.getByText(/The 2 pages with the most to fix, of 120/)).toBeInTheDocument();
  });
});
```

Update `ProductOverview.test.tsx` "lists issues…" test: the pages assertions become `const pages = screen.getByRole("table", { name: /pages Harbour checked/ })` hmm: keep the caption but reword (below) as "Pages Harbour checked, the most to fix first"; use `{ name: /most to fix first/ }`, and `getByText("Hidden from search")` instead of `"noindex"`.

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/pages.test.ts lib/scan/page-rows.test.ts components/products`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/explain/pages.ts`:

```ts
/** A crawled page's HTTP status in plain words, keeping the code for tracking. */
export function pageResult(status: number): string {
  if (status >= 200 && status < 300) return `Loaded (${status})`;
  if (status >= 300 && status < 400) return `Moved (${status})`;
  if (status === 404 || status === 410) return `Not found (${status})`;
  if (status >= 400 && status < 500) return `Refused (${status})`;
  if (status >= 500) return `Server error (${status})`;
  return `No proper answer (${status})`;
}

/** One line above the pages table. The table lists the most troubled pages, so a cut-off count is "at least". */
export function pagesSummary(rows: readonly { problems: readonly string[] }[], total: number): string {
  const checked = `Harbour checked ${total} ${total === 1 ? "page" : "pages"}.`;
  const troubled = rows.filter((row) => row.problems.length > 0).length;
  if (troubled === 0) return `${checked} Nothing needs fixing.`;
  const atLeast = rows.length < total && troubled === rows.length ? "At least " : "";
  return `${checked} ${atLeast}${troubled} ${troubled === 1 ? "has" : "have"} something to fix.`;
}
```

`lib/scan/page-rows.ts` `problemsOf`:

```ts
function problemsOf(page: PageFacts): string[] {
  if (page.status >= 400) return ["Didn't load"];
  if (!isHtmlPage(page)) return [];
  const problems: string[] = [];
  if (page.titleLength === 0) problems.push("Missing title");
  if (page.descriptionLength === 0) problems.push("Missing description");
  if (page.h1Count === 0) problems.push("No main heading");
  if (page.h1Count !== null && page.h1Count > 1) problems.push(`${page.h1Count} main headings`);
  if (page.noindex) problems.push("Hidden from search");
  return problems;
}
```

`components/products/PagesTable.tsx`: wrap in the same section; heading `Pages Harbour checked` (id `pages-heading`); under it `<p className="text-sm text-ink-muted">{pagesSummary(rows, total)}</p>` (skip when empty); empty:

```tsx
<EmptyState what="The pages Harbour checks will be listed here." when="They appear after the first scan finishes." why="Each shows whether it loaded and anything to fix on it." />
```

otherwise

```tsx
<TechnicalDetails id="product-pages" topic="every page Harbour checked">
  <Panel className="overflow-x-auto px-4">
    <table className="w-full text-left text-sm">
      <caption className="py-2 text-left text-xs text-ink-muted">
        {rows.length < total
          ? `The ${rows.length} pages with the most to fix, of ${total} checked`
          : `Pages Harbour checked, the most to fix first`}
      </caption>
      {/* thead: Page | Result | What to fix; the Status cell renders {pageResult(row.status)}, the
          text-bad class for >= 400 stays; the "None" problems cell stays */}
```

(Replace the header texts `Status` with `Result` and `Problems` with `What to fix`; the status cell prints `pageResult(row.status)`; drop the `w-16` width.) In `ScanExamples.tsx` change the example rows' problems to `["Missing title", "Missing description"]` and `["Didn't load"]`.

`tests/e2e/scans.spec.ts`: the pages assertions become

```ts
  const pagesRegion = page.getByRole("region", { name: "Pages Harbour checked" });
  await pagesRegion.getByText("Technical details").click();
  const pages = pagesRegion.getByRole("table");
  await expect(pages.getByRole("row", { name: /\/about\b.*Missing title/ })).toBeVisible();
  await expect(pages.getByRole("row", { name: /\/missing\b.*Not found \(404\).*Didn't load/ })).toBeVisible();
  await expect(pages.getByRole("row", { name: /\/guides\/faq\b/ })).toBeVisible();
```

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(product): pages in Technical details with plain headers and results

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Source panels in plain words

**Files:**
- Modify: `lib/explain/sources.ts`, `lib/explain/sources.test.ts`, `components/products/SourcePanel.tsx`, `components/products/SearchConsolePanel.tsx`, `components/products/PaidSourcePanels.tsx`, `components/products/ProductOverview.test.tsx`, `tests/e2e/scans.spec.ts`
- Create: `lib/explain/search-console.ts`, `lib/explain/search-console.test.ts`, `components/products/SearchConsoleNumbers.tsx`, `components/products/SearchConsolePanel.test.tsx`

**Interfaces:**
- Produces: `sourceExplanation(id: string): SourceExplanation | null` (sources.ts); `searchSummarySentence(clicks: number, impressions: number, format: (n: number) => string): string`.
- Changes: `SourcePanel` props gain `statusLabel: string` (the tag text; `status` still picks the tone).

- [ ] **Step 1: Write the failing tests**

Append to `lib/explain/sources.test.ts`:

```ts
describe("sourceExplanation", () => {
  it("finds a source by id and knows when it doesn't", () => {
    expect(sourceExplanation("search-console")?.name).toBe("Google Search Console");
    expect(sourceExplanation("nope")).toBeNull();
  });
});
```

`lib/explain/search-console.test.ts`:

```ts
import { searchSummarySentence } from "./search-console";

const plain = (n: number) => String(n);

describe("searchSummarySentence", () => {
  it("says what the numbers mean, meaning first", () => {
    expect(searchSummarySentence(10, 240, plain)).toBe(
      "Google showed your pages 240 times, and 10 people clicked through.",
    );
    expect(searchSummarySentence(1, 1, plain)).toBe(
      "Google showed your pages 1 time, and 1 person clicked through.",
    );
    expect(searchSummarySentence(0, 12, plain)).toBe(
      "Google showed your pages 12 times, and nobody clicked through.",
    );
  });
  it("formats the numbers the way the caller says", () => {
    expect(searchSummarySentence(1234, 56789, (n) => n.toLocaleString("de-DE"))).toContain("56.789");
  });
});
```

`components/products/SearchConsolePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { SearchState } from "@/lib/scan/product-view";
import { SearchConsolePanel } from "./SearchConsolePanel";

const panel = (search: SearchState, locale = "en-GB") => {
  render(<SearchConsolePanel search={search} locale={locale} />);
  return screen.getByRole("region", { name: "Google Search Console" });
};
const SUMMARY = {
  startDate: "2026-09-01",
  endDate: "2026-09-28",
  days: [
    { date: "2026-09-01", clicks: 4, impressions: 100 },
    { date: "2026-09-02", clicks: 6, impressions: 140 },
  ],
  clicks: 10,
  impressions: 240,
  topQueries: [{ query: "acme docs install", clicks: 7, impressions: 90, position: 3.4 }],
} as const;
const outsideDetails = (region: HTMLElement) => {
  const copy = region.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("details").forEach((d) => d.remove());
  return copy.textContent ?? "";
};

describe("SearchConsolePanel", () => {
  it("says it isn't connected, why that matters and how to connect it, keeping the setting name in Technical details", () => {
    const region = panel({ state: "not_configured", reason: "HARBOUR_GSC_CREDENTIALS is not set" });
    expect(within(region).getByText("Not connected yet")).toBeInTheDocument();
    expect(region).toHaveTextContent(/how often Google showed your pages/i);
    expect(region).toHaveTextContent("missing, not zero");
    expect(
      within(region).getByRole("link", { name: /How to connect Google Search Console/ }),
    ).toHaveAttribute("href", "https://github.com/rpjonescc/harbour#connect-search-console");
    expect(outsideDetails(region)).not.toMatch(/HARBOUR_/);
    expect(within(region).getByText("HARBOUR_GSC_CREDENTIALS is not set").closest("details")).not.toBeNull();
  });

  it("says Google didn't send the data, and that Harbour will try again", () => {
    const region = panel({ state: "failed", reason: "403 from the API" });
    expect(within(region).getByText("Needs a look")).toBeInTheDocument();
    expect(region).toHaveTextContent("Google didn't send the data in the last check");
    expect(region).toHaveTextContent("try again with the next scan");
    expect(outsideDetails(region)).not.toMatch(/403/);
  });

  it("shows what Google showed first, with the top searches under Technical details", () => {
    const region = panel({ state: "ok", summary: SUMMARY });
    expect(within(region).getByText("Connected")).toBeInTheDocument();
    expect(region).toHaveTextContent("Google showed your pages 240 times, and 10 people clicked through.");
    expect(within(region).getByRole("img", { name: /Daily visits from Google/ })).toBeInTheDocument();
    const details = within(region).getByText(/Technical details/).closest("details") as HTMLElement;
    const heads = within(details).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Search", "Clicks", "Times shown", "Average position"]);
    expect(within(details).getByRole("rowheader", { name: "acme docs install" })).toBeInTheDocument();
    expect(region).toHaveTextContent("1 Sept 2026 to 28 Sept 2026");
    expect(within(region).queryByRole("link", { name: /How to connect/ })).toBeNull();
  });

  it("formats the numbers in the configured locale", () => {
    const region = panel({ state: "ok", summary: { ...SUMMARY, clicks: 1234, impressions: 56789, topQueries: [] } }, "de-DE");
    expect(region).toHaveTextContent("56.789");
  });

  it("does not offer setup steps when it ran but stored no summary", () => {
    const region = panel({ state: "ok", summary: null });
    expect(region).toHaveTextContent("Google sent no search data for this scan");
    expect(within(region).queryByRole("link", { name: /How to connect/ })).toBeNull();
  });

  it("explains the wait before the first scan", () => {
    const region = panel({ state: "none", reason: null });
    expect(within(region).getByText("Not connected yet")).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: /How to connect/ })).toBeInTheDocument();
  });
});
```

Add a paid-panel test to `ProductOverview.test.tsx` (replacing the old "shows Search Console's setup link and the paid sources" and the four Search Console tests, which move to the new file):

```tsx
  it("shows the paid data as not available yet, in plain words", () => {
    renderPage(scanned);
    for (const name of ["What AI assistants say about you", "Where you rank on Google"]) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveTextContent("Not available yet");
      expect(region).toHaveTextContent("Harbour doesn't collect this data yet.");
      expect(within(region).getByRole("link", { name: /What the scores use today/ })).toBeVisible();
    }
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain components/products`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/explain/sources.ts`: add after `sourceName`:

```ts
/** A data source's explanation by id; null for an id Harbour doesn't know. */
export function sourceExplanation(id: string): SourceExplanation | null {
  return BY_ID.get(id) ?? null;
}
```

`lib/explain/search-console.ts`:

```ts
/** What Search Console's totals mean, in a sentence (the numbers sit small inside it). */
export function searchSummarySentence(
  clicks: number,
  impressions: number,
  format: (n: number) => string,
): string {
  const shown = `${format(impressions)} ${impressions === 1 ? "time" : "times"}`;
  const people =
    clicks === 0
      ? "nobody clicked through"
      : `${format(clicks)} ${clicks === 1 ? "person" : "people"} clicked through`;
  return `Google showed your pages ${shown}, and ${people}.`;
}
```

`SourcePanel.tsx`: replace the `TAG` table with `const TONE = { connected: "accent", "not-connected": "neutral", failed: "warn" } as const;`, add the `statusLabel: string` prop and render `<Tag tone={TONE[status]}>{statusLabel}</Tag>`.

`SearchConsoleNumbers.tsx`: move `Totals` and `TopQueries` out of `SearchConsolePanel.tsx` (they take `summary`, `number`, `period`), changing words: Totals `dl` terms `Visits from Google` (clicks) and `Times shown in search` (impressions), sparkline `label={`Daily ${label.toLowerCase()}, ${period}`}`; `TopQueries` table caption `Top searches by clicks`, headers `Search`, `Clicks`, `Times shown`, `Average position`, and its empty text `No searches in this window.` Export both plus `numberFormat`.

`SearchConsolePanel.tsx`:

```tsx
const ID = "search-console";
const TITLE = sourceName(ID);
const MISSING_NOT_ZERO = "Until it is, these numbers are missing, not zero.";

function Raw({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <TechnicalDetails id="search-console-reason" topic="what Harbour recorded">
      <p>{reason}</p>
    </TechnicalDetails>
  );
}

function ConnectLink() {
  return <DocsLink href={DOCS_LINKS.searchConsole}>How to connect {TITLE}</DocsLink>;
}

export function SearchConsolePanel({ search, locale }: { search: SearchState; locale: string }) {
  const gives = sourceExplanation(ID)?.gives ?? "";
  if (search.state === "ok" && search.summary) { /* connected: period note, sentence, <Totals>, then
      <TechnicalDetails id="search-console-queries" topic="top searches in numbers"><TopQueries …/></TechnicalDetails> */ }
  if (search.state === "failed") {
    return (
      <SourcePanel id={ID} title={TITLE} status="failed" statusLabel="Needs a look">
        <p className="text-sm text-ink">{sourceStatusPhrase(ID, "failed")}. Harbour will try again with the next scan. {MISSING_NOT_ZERO}</p>
        <p className="text-xs"><ConnectLink /></p>
        <Raw reason={search.reason} />
      </SourcePanel>
    );
  }
  if (search.state === "ok") {
    return (
      <SourcePanel id={ID} title={TITLE} status="connected" statusLabel={sourceStatusPhrase(ID, "ok")}>
        <p className="text-sm text-ink-muted">Connected, but Google sent no search data for this scan. That is normal for a new site; it fills in as Google gathers data.</p>
      </SourcePanel>
    );
  }
  // not_configured, skipped or never run: connect it to get the numbers.
  return (
    <SourcePanel id={ID} title={TITLE} status="not-connected" statusLabel={sourceStatusPhrase(ID, "not_configured")}>
      <p className="text-sm text-ink-muted">{gives} {MISSING_NOT_ZERO}</p>
      <p className="text-xs"><ConnectLink /></p>
      <Raw reason={search.state === "none" ? null : search.reason} />
    </SourcePanel>
  );
}
```

(Write the connected branch out in full: the existing JSX with the sentence `searchSummarySentence(summary.clicks, summary.impressions, number)` added above the totals and the period note reading `${period} (Google's numbers run about 3 days behind)`. `sourceStatusPhrase(ID, "ok")` is "Connected" and `"not_configured"` is "Not connected yet", exactly the strings the tests check. The `skipped` state falls into the last branch: its status phrase would read "waiting", so pass `"not_configured"` as written.) Each file stays under 200 lines; if `SearchConsolePanel.tsx` is over after the move, the `ok` branch goes into a small `ConnectedBody` function.

`PaidSourcePanels.tsx`:

```tsx
import { DocsLink } from "@/components/ui/DocsLink";
import { DOCS_LINKS } from "@/lib/docs-links";
import { sourceExplanation, sourceStatusPhrase } from "@/lib/explain/sources";
import { SourcePanel } from "./SourcePanel";

const PANELS = [
  {
    id: "ai-engines",
    sourceId: "openai",
    title: "What AI assistants say about you",
    body: "Whether ChatGPT, Perplexity, Gemini and Claude mention and link to your site when people ask their questions.",
  },
  {
    id: "rankings",
    sourceId: "dataforseo",
    title: "Where you rank on Google",
    body: "Where your pages appear on Google for the searches you care about, and who gets the answer box at the top.",
  },
] as const;

/** Paid data that Harbour doesn't collect yet: said plainly, with no setting names. */
export function PaidSourcePanels() {
  return (
    <>
      {PANELS.map((panel) => (
        <SourcePanel
          key={panel.id}
          id={panel.id}
          title={panel.title}
          status="not-connected"
          statusLabel={sourceStatusPhrase(panel.sourceId, "not_configured")}
        >
          <p className="text-sm text-ink-muted">{panel.body}</p>
          <p className="text-xs text-ink-muted">
            {sourceExplanation(panel.sourceId)?.connect[0]}{" "}
            <DocsLink href={DOCS_LINKS.scores}>What the scores use today</DocsLink>
          </p>
        </SourcePanel>
      ))}
    </>
  );
}
```

`tests/e2e/scans.spec.ts` (first test), replace the Search Console and paid-panel assertions:

```ts
  const searchConsole = page.getByRole("region", { name: "Google Search Console" });
  await expect(searchConsole.getByText("Not connected yet", { exact: true })).toBeVisible();
  await expect(
    searchConsole.getByRole("link", { name: /How to connect Google Search Console/ }),
  ).toHaveAttribute("href", /#connect-search-console$/);
  for (const name of ["What AI assistants say about you", "Where you rank on Google"]) {
    const panel = page.getByRole("region", { name });
    await expect(panel.getByText("Not available yet", { exact: true })).toBeVisible();
    await expect(panel.getByRole("link", { name: /What the scores use today/ })).toBeVisible();
  }
```

Update the `/design` example (`ScanExamples.tsx`) only if it passes `SourcePanel` directly (it uses `SearchConsolePanel` and `PaidSourcePanels`, so nothing changes).

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components tests
git commit -m "feat(product): source panels in plain words, raw reasons under Technical details

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scan status and Scan now in plain words

**Files:**
- Create: `lib/explain/scan-status.ts`, `lib/explain/scan-status.test.ts`, `components/products/ScanStatusNote.test.tsx`
- Modify: `components/products/ScanStatusNote.tsx`, `components/products/ScanNowButton.tsx`, `components/products/ScanNowButton.test.tsx`, `components/products/ProductOverview.test.tsx`

**Interfaces:**
- Produces (scan-status.ts): `NEVER_SCANNED: string`; `activeScanSentence(status: "queued" | "running", started: string): string`; `lastScanSentence(input: { status: "ok" | "partial" | "failed"; when: string; showing: string | null }): string`; `SCAN_NOW: { queued: string; already: string; failed: string }`.
- Consumes: `sourceStatusPhrase` (failed phrases per source), `collectorLabel` (inside Technical details only).

- [ ] **Step 1: Write the failing tests**

`lib/explain/scan-status.test.ts`:

```ts
import { activeScanSentence, lastScanSentence, NEVER_SCANNED, SCAN_NOW } from "./scan-status";

describe("scan status sentences", () => {
  it("says what happens for a site that was never scanned", () => {
    expect(NEVER_SCANNED).toMatch(/hasn't scanned this site yet.*Scan now.*scores appear/);
  });

  it("says a scan is running or waiting, and that the page updates", () => {
    expect(activeScanSentence("running", "1 Oct 2026, 06:04")).toBe(
      "Scanning now (started 1 Oct 2026, 06:04). This page updates when it finishes.",
    );
    expect(activeScanSentence("queued", "x")).toBe(
      "A scan is waiting to start. It begins as soon as Harbour is free. This page updates when it finishes.",
    );
  });

  it("says how the last scan ended and what to do", () => {
    const when = "1 Oct 2026, 06:04";
    expect(lastScanSentence({ status: "ok", when, showing: null })).toBe("Last scan 1 Oct 2026, 06:04.");
    expect(lastScanSentence({ status: "partial", when, showing: null })).toBe(
      "Last scan 1 Oct 2026, 06:04. Some data sources had a problem, so some scores may be missing for now.",
    );
    expect(lastScanSentence({ status: "failed", when, showing: "30 Sept 2026, 06:00" })).toBe(
      "The last scan didn't finish (1 Oct 2026, 06:04). You're seeing the results of the scan from 30 Sept 2026, 06:00. Try Scan now again.",
    );
    expect(lastScanSentence({ status: "failed", when, showing: null })).toBe(
      "The last scan didn't finish (1 Oct 2026, 06:04). There are no results yet. Try Scan now again.",
    );
  });

  it("answers what happened and what to do for each Scan now outcome", () => {
    expect(SCAN_NOW.queued).toBe("Scan queued. It starts shortly.");
    expect(SCAN_NOW.already).toBe("A scan is already waiting to run.");
    expect(SCAN_NOW.failed).toBe("Harbour couldn't start the scan. Nothing changed, so try again in a moment.");
  });
});
```

`components/products/ScanStatusNote.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { ScanState } from "@/lib/scan/views";
import { ScanStatusNote } from "./ScanStatusNote";

const AT = new Date("2026-10-01T06:04:00Z");
const note = (scan: ScanState, latest = null) =>
  render(<ScanStatusNote scan={scan} latest={latest} timeZone="UTC" locale="en-GB" />);
const last = (over: Partial<NonNullable<ScanState["last"]>>): ScanState => ({
  active: null,
  last: {
    scanId: 1,
    status: "failed",
    startedAt: AT,
    finishedAt: AT,
    error: null,
    failedCollectors: [],
    ...over,
  },
});

describe("ScanStatusNote", () => {
  it("explains a failed scan in words and keeps the raw error under Technical details", () => {
    note(last({ error: "All collectors failed" }));
    expect(
      screen.getByText("The last scan didn't finish (1 Oct 2026, 06:04). There are no results yet. Try Scan now again."),
    ).toBeInTheDocument();
    const details = screen.getByText(/Technical details/).closest("details") as HTMLElement;
    expect(within(details).getByText("All collectors failed")).toBeInTheDocument();
  });

  it("names a data source that had a problem in plain words, with its raw error folded away", () => {
    note(
      last({
        status: "partial",
        failedCollectors: [{ collector: "pagespeed", error: "quota exceeded" }],
      }),
    );
    expect(screen.getByText("Google's speed test didn't answer in the last check")).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed: quota exceeded/).closest("details")).not.toBeNull();
    expect(screen.queryByText(/PageSpeed failed/)).toBeNull();
  });

  it("shows no Technical details when there is nothing raw to show", () => {
    note(last({ status: "ok" }));
    expect(screen.getByText(/^Last scan 1 Oct 2026, 06:04\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/Technical details/)).toBeNull();
  });

  it("says what to do before the first scan, and while one runs", () => {
    const { unmount } = note({ active: null, last: null });
    expect(screen.getByText(/hasn't scanned this site yet/)).toBeInTheDocument();
    unmount();
    note({ active: { jobId: 4, status: "running", since: AT }, last: null });
    expect(screen.getByRole("status")).toHaveTextContent("Scanning now (started 1 Oct 2026, 06:04)");
  });
});
```

`ScanNowButton.test.tsx`: change the three expectations to `"Scan queued. It starts shortly."`, `"A scan is already waiting to run."`, and `"Harbour couldn't start the scan"`. In `ProductOverview.test.tsx` the "never scanned" test's `screen.getByText(/Not scanned yet/)` becomes `/hasn't scanned this site yet/`, the failed-scan test and the `PageSpeed failed` assertion are deleted (covered by the new file).

- [ ] **Step 2: Run to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/explain/scan-status.test.ts components/products`
Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/explain/scan-status.ts`:

```ts
/** What the Product page says about scanning, in the owner's words (spec §5.5). */
export const NEVER_SCANNED =
  "Harbour hasn't scanned this site yet. Choose Scan now to run the first scan; the scores appear when it finishes.";

const WHEN_DONE = "This page updates when it finishes.";

/** A scan that is queued or running. `started` is the formatted start time. */
export function activeScanSentence(status: "queued" | "running", started: string): string {
  return status === "running"
    ? `Scanning now (started ${started}). ${WHEN_DONE}`
    : `A scan is waiting to start. It begins as soon as Harbour is free. ${WHEN_DONE}`;
}

/**
 * How the last scan ended. `showing` is when the scores on screen come from (a failed scan
 * never hides the last good results); null when there are none.
 */
export function lastScanSentence(input: {
  status: "ok" | "partial" | "failed";
  when: string;
  showing: string | null;
}): string {
  const { status, when, showing } = input;
  if (status === "ok") return `Last scan ${when}.`;
  if (status === "partial") {
    return `Last scan ${when}. Some data sources had a problem, so some scores may be missing for now.`;
  }
  const seeing = showing
    ? `You're seeing the results of the scan from ${showing}.`
    : "There are no results yet.";
  return `The last scan didn't finish (${when}). ${seeing} Try Scan now again.`;
}

/** What Scan now says back: what happened, and what to do when it didn't work. */
export const SCAN_NOW = {
  queued: "Scan queued. It starts shortly.",
  already: "A scan is already waiting to run.",
  failed: "Harbour couldn't start the scan. Nothing changed, so try again in a moment.",
} as const;
```

`ScanNowButton.tsx`: import `SCAN_NOW`; `setNote(SCAN_NOW.failed)`, `setNote(result.data.created ? SCAN_NOW.queued : SCAN_NOW.already)`.

`ScanStatusNote.tsx` (rewrite the bodies; keep the exported signature):

```tsx
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { activeScanSentence, lastScanSentence, NEVER_SCANNED } from "@/lib/explain/scan-status";
import { sourceStatusPhrase } from "@/lib/explain/sources";
import { formatDateTime } from "@/lib/format/date";
import { collectorLabel } from "@/lib/scan/labels";
import type { ScanState, ScoreSnapshot } from "@/lib/scan/views";

// …Props and NOTE unchanged

function ActiveNote({ active, at }: { active: NonNullable<ScanState["active"]>; at: (d: Date) => string }) {
  return (
    <p role="status" className={`${NOTE} bg-accent-soft text-ink`}>
      {activeScanSentence(active.status, at(active.since))}
    </p>
  );
}

function RawErrors({ last }: { last: NonNullable<ScanState["last"]> }) {
  if (last.error === null && last.failedCollectors.length === 0) return null;
  return (
    <div className="mt-2">
      <TechnicalDetails id="scan-errors" topic="what Harbour recorded about the problem">
        <ul className="flex flex-col gap-0.5">
          {last.error !== null && <li>{last.error}</li>}
          {last.failedCollectors.map((f) => (
            <li key={f.collector}>
              {collectorLabel(f.collector)}: {f.error ?? "no message recorded"}
            </li>
          ))}
        </ul>
      </TechnicalDetails>
    </div>
  );
}

function LastScanNote({ last, latest, at }: { /* same props */ }) {
  const sentence = lastScanSentence({
    status: last.status,
    when: at(last.finishedAt ?? last.startedAt),
    showing: latest ? at(latest.computedAt) : null,
  });
  return (
    <div className={`${NOTE} ${last.status === "ok" ? "bg-surface-sunk text-ink-muted" : "bg-warn-soft text-ink"}`}>
      <p>{sentence}</p>
      {last.failedCollectors.length > 0 && (
        <ul className="mt-1">
          {last.failedCollectors.map((f) => (
            <li key={f.collector}>{sourceStatusPhrase(f.collector, "failed")}</li>
          ))}
        </ul>
      )}
      <RawErrors last={last} />
    </div>
  );
}
```

and the never-scanned branch renders `NEVER_SCANNED`.

- [ ] **Step 4: Run to verify they pass**

Run: `source ~/.nvm/nvm.sh && pnpm fix && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib components
git commit -m "feat(product): scan status and Scan now answer what happened and what to do

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: E2E: the Product page in plain words

**Files:**
- Modify: `tests/e2e/plain-language.ts`, `tests/e2e/scans.spec.ts`

**Interfaces:**
- Produces: `RULE_JARGON: RegExp` and `expectPlainIssueTitles(page): Promise<void>` from `tests/e2e/plain-language.ts`; `expectPlainLanguage` also asserts no tab is named by an area code.

- [ ] **Step 1: Extend the smoke helper**

In `tests/e2e/plain-language.ts` add:

```ts
/** File names, markup and bot names that don't belong in a card title (spec §5.2, step 4). */
export const RULE_JARGON =
  /robots\.txt|llms\.txt|noindex|meta description|structured data|JSON-LD|schema|Preferred Sources|\b\w+Bot\b/i;

/** Every issue card on the page is titled in plain words. */
export async function expectPlainIssueTitles(page: Page): Promise<void> {
  const titles = await page.getByRole("article").getByRole("heading").allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) expect(title).not.toMatch(RULE_JARGON);
}
```

and, inside `expectPlainLanguage`, after the heading check: `await expect(page.getByRole("tab", { name: /^(SEO|GEO|AEO)$/ })).toHaveCount(0);`.

- [ ] **Step 2: Add the Product page to the smoke test**

In `tests/e2e/scans.spec.ts`, first test, after the area-card assertions:

```ts
  await expectPlainLanguage(page);
  await expectPlainIssueTitles(page);
  for (const old of ["Search engines", "Direct answers"]) {
    await expect(page.getByText(old, { exact: true })).toHaveCount(0);
  }
```

(import `expectPlainIssueTitles` next to `expectPlainLanguage`). Add a new test after the keyboard test:

```ts
test("an area card's explainer opens from the keyboard and the numbers stay one click away", async ({ page }) => {
  await page.goto("/products/acme-docs");
  const button = page.getByRole("button", { name: /What's this\? \(Found on Google\)/ });
  await hydrated(button);
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Why Harbour checks it").first()).toBeVisible();
  // The sub-score numbers and keys sit under Technical details, closed until asked for.
  const panel = page.getByRole("tabpanel", { name: "Found on Google" });
  await expect(panel.getByText("seo.technical")).toBeHidden();
  await panel.getByText("Technical details").click();
  await expect(panel.getByText("seo.technical")).toBeVisible();
});
```

(import `hydrated` from `./hydration`.) The serial describe means it runs after the scan test, so the product is scored.

- [ ] **Step 3: Run the whole e2e suite**

Run: `source ~/.nvm/nvm.sh && pnpm test:e2e`
Expected: PASS. Fix any assertion the earlier tasks missed (a stale old name is the likely failure; update it to the plain wording rather than loosening the check).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): the Product page in plain words, with the smoke check extended

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: README, spec notes and full verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md`

- [ ] **Step 1: README**

Replace the **Product pages** bullet in the feature list (around line 34) with:

```
- **Product pages** — per product: three area cards (Found on Google, Recommended by AI
  assistants, Answer-ready) each with a verdict, the small number and "What's this?", a
  one-line summary, **Scan now**, a tab per area listing its sub-scores as plain sentences
  (weakest first), **What to fix** with a **Hand to Claude** button that copies a ready prompt,
  the pages Harbour checked, and Google Search Console totals. The numbers, scoring keys, raw
  evidence, page and search tables sit under **Technical details**.
```

In the "Product page" paragraph (around line 590) rewrite to match: the page opens with the area cards and summary; each tab explains every sub-score (a plain sentence, weakest first, with "What's this?"; missing ones read "Not counted yet" with the reason); **What to fix** lists the scan's issues with plain titles (the `lib/scan/issue-rules.ts` rule titles; the exact `fix` and `check` text and the affected URLs are under Technical details). Keep the existing explanation of unknown vs fixed issues and the **Hand to Claude** description. Add: "Actions created before a title was reworded keep the old title until the next scan finds the issue again; open, in-progress, snoozed and dismissed actions then take the new title, and an action already resolved keeps its old one."

The route table row (`/products/<id>`) stays as is. No setting, command or script changed; say so in the commit body only. Check `README.md` for other mentions of "Search engines", "AI assistants" tile names or "SEO/GEO/AEO tabs" (`grep -n "SEO/GEO/AEO\|Search engines\|Direct answers" README.md`) and fix each.

- [ ] **Step 2: Spec note**

In `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md`, after the §5.2 bullets add an "As built:" list:

```
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
```

- [ ] **Step 3: Full verification**

Run: `source ~/.nvm/nvm.sh && pnpm check && pnpm test:e2e`
Expected: PASS, with no `check:files` warnings for files this plan touched (split any that crossed a soft limit: likely candidates are `ProductOverview.test.tsx` and `SearchConsolePanel.tsx`). Open `/design` in light and dark and confirm the area cards, a sub-score row, the issue card, the pages table, the Search Console panel and the status notes render and read well.

- [ ] **Step 4: Check for private data, then commit**

Run `git diff --cached` and confirm the diff holds only fictional data (Acme Docs, `docs.example.com`, `example` repositories) and no home paths, then:

```bash
git add README.md docs
git commit -m "docs: the Product page in plain words

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (§5.2, §5.5, §2, §3).** Area cards and a one-line summary: Task 2. Sub-scores as plain sentences, weakest first, with explainers: Task 3. Issues, pages, keywords behind Technical details or kept as plain cards, plain headers: Tasks 4, 5, 6 (question matrix: not built yet, Decision 4). Source panels, scan status, Scan now in plain words with `lib/explain/sources` phrases: Tasks 6, 7. Old tile names and their e2e assertions: Task 2 (and Task 8 asserts they are gone). Rule titles: Task 1. E2E smoke on the Product page: Task 8. README: Task 9.

**Placeholders.** None: new modules and tests are written out. Where a task edits an existing component it shows the changed parts and states which untouched parts stay (for `SearchConsolePanel`'s connected branch and `PagesTable`'s table body the task says exactly what moves or changes).

**Type consistency.** `averageScore`, `gapReason`, `productSummary`, `weakestFirst`, `pageResult`, `pagesSummary`, `sourceExplanation`, `searchSummarySentence`, `activeScanSentence`, `lastScanSentence`, `SCAN_NOW`, `NEVER_SCANNED`, `RULE_JARGON` and `expectPlainIssueTitles` are defined in the task that first uses them, and later tasks use them with the same signatures.
