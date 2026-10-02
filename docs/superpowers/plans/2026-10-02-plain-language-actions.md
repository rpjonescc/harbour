# Plain-language UX (step 3: the Actions board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Actions board speaks the owner's language: statuses read New ideas / To do / In progress / Done / Snoozed / Dismissed, each card leads with its plain title, why it matters, impact and effort phrases, who's on it and its pull request, and everything technical (evidence, source, rule key, the fix and check text, the "Hand to Claude" prompt) sits behind `<TechnicalDetails>`. The scan's rule reasons stop leaking `<title>` and `X-Robots-Tag`, on the board and on Today.

**Architecture:** Same pattern as steps 1–2. Fixed words live in `lib/explain/actions.ts` (pure) and beside the components (`components/actions/action-labels.ts`); the board's data (`ActionView`) gains `who`, computed with the same "latest status-changing event" rule Today already uses (a new pure `lastStatusActor`, parity-tested against `activeWork`). The plain rewording of the rule reasons is done where the rules are defined (`lib/scan/issue-rules.ts`), pinned by a new test; stored rows pick it up on the next scan through the existing rule-sync refresh. No schema, status value, URL parameter or API change.

**Tech Stack:** existing stack only (Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4 semantic tokens, Drizzle/SQLite, Vitest + Testing Library (`fireEvent`; no user-event), Playwright, Biome, pnpm). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md` (§3 vocabulary and "Who's on it", §5.3 Actions, §5.5 Messages, §2 principles; §8 step 3). **Rules:** `AGENTS.md`. **Builds on:** `docs/superpowers/plans/2026-10-02-plain-language-ux.md` (`lib/explain`, `components/explain`, `activeWork`, `expectPlainLanguage`) and the `pnpm actions` / PR-link change (`prUrl`, actor `claude`).

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
- Wording: "impact high/medium/low → Big win / Worth doing / Small win", "effort small/medium/large → quick job / an afternoon / a project".
- Action columns: "suggested → New ideas", "open → To do", "in_progress → In progress", "done → Done", "snoozed → Snoozed", "dismissed → Dismissed". "Status values in the data model are unchanged."
- Who's on it ("derived from the status, the PR link and who made the latest *status-changing* event — its creation counts; a PR-link event, which keeps the status, does not"): ""New idea, not decided yet": the action is suggested."; ""Pull request waiting for your OK": it is in progress and has a PR link (whoever started it)."; ""Claude is on it": it is in progress, with no PR link, and Claude moved it there."; ""Waiting for you": it is open, or in progress and moved there by anyone else (or by someone Harbour no longer knows, after old history was pruned)."; "Done, snoozed and dismissed actions show no "who's on it"."
- §5.3: "Board columns are renamed as in §3." "Each card leads with the plain title, why it matters, the effort and impact phrases, who's on it, and the PR link (from the actions CLI work)." "Evidence, source, rule key and the Hand to Claude prompt sit behind Technical details."
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
- "`lib/scan/*` is pure (no I/O) and versioned"; "`app/` routes stay thin: parse input, call `lib/`, render. No business logic."
- "**Types are strict.** `strict: true`, no `any`, no non-null `!` without a comment explaining why it is safe." (Biome errors on `!`, tests included: guard instead.)
- "**No dead code.**" "**No duplication of logic.** Second copy → extract a shared helper." "**Functions stay small** (aim < 40 lines)." "**Comments explain why**, not what. Public functions get a one-line doc comment."
- "Tests bind the real production code path, not test-only copies." "New logic ships with tests; bug fixes ship with a regression test that fails without the fix." "No paid API calls in tests — use recorded fixtures."
- "This repo is public. Never commit personal data… Use fictional examples (`example.com`, `owner@example.com`)." Fixtures here use Acme Docs, Lighthouse Café and `https://github.com/example/site/pull/<n>`.
- README: "**Update it in the same change** whenever you add or change a feature…" (Task 8).
- "Small, focused commits with a clear message (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)." Every commit message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use the line of the model that is actually executing the task). Never `--no-verify`.
- "Run `pnpm check` (typecheck, lint, format, size, tests) before committing."

**Environment**

- Node 22: prefix every command with `source ~/.nvm/nvm.sh &&`.
- Next.js 16 has breaking changes. This plan adds no new Next APIs: it uses `next/link`, the `"use client"` directive (props of a client component must be serialisable) and server components as already used in `components/actions/`. If a step touches anything else, read the matching guide in `node_modules/next/dist/docs/` first.
- Code blocks may run past Biome's 100-column width: run `pnpm fix` (format only) before `pnpm lint` in every task.
- `lib/explain/**` may import **values** only from `lib/explain/**`, `lib/scan/labels.ts` and `lib/scan/scoring/sub-score.ts`; everything else is `import type` only, so client components never bundle the database layer. `lib/actions/status-actor.ts` (Task 4) is pure and type-only for the same reason.

## Review Focus

Inputs the spec implies that are most likely to bite the owner; each has a pinned test in the task named.

1. **Pruned or unusual history on the board.** An in-progress action whose status-changing events were pruned (only PR-link events left), or moved by `scan`/`system`, must read "Waiting for you", never "Claude is on it"; the board and Today must agree. Tests: Task 4 (`lastStatusActor` pruned case; board/`activeWork` parity).
2. **Abbreviations in a reason.** "Add a button, e.g. near recent articles." must not become "Add a button, e.g." on Today. Test: Task 2.
3. **"Hand to Claude" behind a closed disclosure.** The keyboard path must still reach it (Technical details summary, then the button once open), the owner's remembered open/closed choice must not break a card whose control the owner needs, and the button must keep its per-card accessible name. Tests: Task 6 (hidden query), Task 7 (keyboard e2e).
4. **Stored jargon until the next scan.** Existing rule actions hold the old reason in the database. The next scan's refresh rewrites it (the existing rule-sync tests cover `why` changing on refresh; Task 3 verifies this instead of adding a migration), and the README says old text stays until then (Task 8).
5. **Invalid stored evidence or docs.** The card still renders, says Harbour couldn't read it, and keeps the rest of its Technical details. Test: Task 6.
6. **A change that went stale.** The 409 messages and the session-ended message answer "what happened, what do I do". Test: Task 5.

## Decisions (spec ambiguities resolved here)

1. **"Board columns".** The board is a single list grouped by impact, filtered by status, not a kanban of columns, and the spec says "renamed", not "rebuilt". So the six column names (`STATUS_COLUMN`) are used everywhere a status appears: card tag, status filter, header counts, history, empty states, control wording. The layout stays. URL values (`?status=suggested|snoozed|…`) and API bodies keep the stored status values, so bookmarks and `pnpm actions` keep working.
2. **Group headings.** Groups are headed by impact in the spec's words, plural for a group: "Big wins", "Worth doing", "Small wins" (`IMPACT_GROUP`), while a card's tag uses the singular phrase (`IMPACT_PHRASE`). The `id`s (`impact-high` …) and `data-impact` stay: the focus-after-change code depends on them.
3. **Where the plain rewording of rule reasons lives.** In `lib/scan/issue-rules.ts`, by rewriting each rule's `problem` in plain words. Reasons: it is the single source of both the board's `why` and the product page's problem text; a `lib/explain` table keyed by rule id would be a second copy that drifts, and could not reach agent-written text anyway. It is pinned by `lib/scan/issue-rules-plain.test.ts` (exact text plus a jargon regex). `fix` and `check` stay exact and technical on purpose: they are what "Hand to Claude" quotes and what the next scan verifies, and the board now shows them only inside Technical details. Rule **titles** (e.g. "robots.txt blocks GPTBot", "No llms.txt") are unchanged: they name the thing precisely, double as the e2e card names, and changing them is a copy decision for the owner; flagged in the final notes.
4. **Who's on it for board cards.** The spec's rule is already implemented in SQL for Today (`activeWork`). The board already loads each card's events, so `toViews` reads the same rule from them with a pure `lastStatusActor` (Task 4). The two implementations are tied together by a parity test rather than forcing the board through `activeWork` (which would add a second query per card).
5. **"Hand to Claude" is behind Technical details** (spec §5.3). It costs the owner one click; the Technical details summary is the keyboard stop that leads to it. All cards share one remembered open/closed choice (`id="action-card"`).
6. **Reject → Dismiss.** A suggestion's two buttons are "Accept" and "Dismiss" (the spec names accept, dismiss and snooze; "Dismiss" matches the Dismissed column). Other control labels follow the column names: "Move back to To do", "Bring back now" (was "Wake now"), "Restore to To do".
7. **`ACTION_ACTORS`** is the one list (`lib/actions/types.ts`); the schema's `action_events.actor` enum and `active-work` both read it. Statuses and impacts have similar duplicate lists, left alone: out of this step's scope (flagged).
8. **"Worth doing" / "Worth doing next".** Kept as is. On the Actions page "Worth doing" is the middle group heading and card tag; Today's "Worth doing next" is a different page's section name; no screen shows both, and the e2e regions are distinct. No change forced.
9. **Product page.** `IssueItem` imports the deleted `IMPACT_LABEL`/`STATUS_LABEL`, so it switches to `IMPACT_PHRASE`/`STATUS_COLUMN` (a two-line change); everything else on that page is step 4.
10. **Left for later steps:** the sidebar's "N open actions" label (shell), the Actions page's `ApprovalsNote` wording (shares copy with Settings, step 5).

## File Structure

```
lib/actions/
  types.ts                  + ACTION_ACTORS (one source), ActionActor derived from it
  status-actor.ts (+test)   NEW pure lastStatusActor(events)
  views.ts                  ActionView gains `who`
  active-work.ts            reads ACTION_ACTORS
lib/db/schema/actions.ts    actor enum = ACTION_ACTORS
lib/explain/actions.ts      + IMPACT_GROUP, boardSummary()
lib/scan/issue-rules.ts     plain `problem` text per rule
lib/scan/issue-rules-plain.test.ts   NEW
lib/today/reason.ts         firstSentence knows e.g. / i.e. / vs. / approx.
components/actions/
  action-labels.ts (+test)  plain statuses, controls, filters, empty states, actors, source
  ActionCard.tsx            leads with plain words
  ActionTechnical.tsx       NEW: fix/check, source, rule key, evidence, docs, Hand to Claude
  ActionEvidence.tsx        no inner <details>
  ActionFilters.tsx / ActionHistory.tsx / ActionBoard.tsx / ActionStatusControls.tsx / SyncFailureNote.tsx
app/(app)/actions/page.tsx  plain summary line
components/products/IssueItem.tsx, components/design/ActionExamples.tsx, action-example-data.ts
tests/e2e/actions.spec.ts, tests/e2e/plain-language.ts
README.md, docs/superpowers/specs/2026-10-02-plain-language-ux-design.md (§5.3 notes)
```

---

### Task 1: One shared `ACTION_ACTORS`

**Files:**
- Modify: `lib/actions/types.ts`, `lib/db/schema/actions.ts`, `lib/actions/active-work.ts`
- Create: `lib/actions/types.test.ts`

**Interfaces:**
- Produces: `ACTION_ACTORS: readonly ["owner", "claude", "scan", "agent", "system"]` and `type ActionActor = (typeof ACTION_ACTORS)[number]` from `@/lib/actions/types` (the type's name and members are unchanged, so every existing import keeps working).

- [ ] **Step 1: Write the failing test**

`lib/actions/types.test.ts`:

```ts
import { getTableColumns } from "drizzle-orm";
import { actionEvents } from "@/lib/db/schema";
import { ACTION_ACTORS } from "./types";

describe("ACTION_ACTORS", () => {
  // The schema and active-work once each kept their own copy of this list.
  it("is exactly what the history table's actor column accepts", () => {
    expect(getTableColumns(actionEvents).actor.enumValues).toEqual([...ACTION_ACTORS]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/actions/types.test.ts`
Expected: FAIL (`ACTION_ACTORS` is not exported / undefined is not iterable).

- [ ] **Step 3: Implement**

`lib/actions/types.ts`: replace the `ActionActor` line with

```ts
/** Everyone who can change an action; the history table's actor column uses this list. */
export const ACTION_ACTORS = ["owner", "claude", "scan", "agent", "system"] as const;
export type ActionActor = (typeof ACTION_ACTORS)[number];
```

`lib/db/schema/actions.ts`: add `import { ACTION_ACTORS } from "@/lib/actions/types";` below the existing `import type { Evidence } …` line (that file's import of `types.ts` stays type-only in the other direction, so there is no runtime cycle) and change the column to

```ts
    actor: text("actor", { enum: ACTION_ACTORS }).notNull(),
```

`lib/actions/active-work.ts`: replace the local `ACTORS` constant and `isActor` with

```ts
import { ACTION_ACTORS, ACTIVE, type ActionActor, type ActionRow } from "./types";

const isActor = (value: unknown): value is ActionActor =>
  typeof value === "string" && (ACTION_ACTORS as readonly string[]).includes(value);
```

(and drop the old `import { ACTIVE, … }` line).

- [ ] **Step 4: Run tests and the type check**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/actions && pnpm typecheck && git status --short`
Expected: PASS; `git status` shows no new file under the migrations folder (an enum change on a SQLite text column does not alter the table; if a migration appears, stop and report).

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add lib/actions/types.ts lib/actions/types.test.ts lib/actions/active-work.ts lib/db/schema/actions.ts
git commit -m "refactor: one ACTION_ACTORS list for the schema and active-work

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `firstSentence` does not cut at "e.g."

**Files:**
- Modify: `lib/today/reason.ts`, `lib/today/reason.test.ts`

**Interfaces:**
- Produces: `firstSentence(text: string): string` (signature unchanged).

- [ ] **Step 1: Write the failing test**

In `lib/today/reason.test.ts`, add rows to the `it.each` table:

```ts
    [
      "Add a button, e.g. near recent articles. Then wait.",
      "Add a button, e.g. near recent articles.",
    ],
    ["Use a short title, i.e. under 60 characters. Done.", "Use a short title, i.e. under 60 characters."],
    ["Big vs. small pages matter. Next.", "Big vs. small pages matter."],
    // "etc." often ends a sentence, so it is not treated as an abbreviation.
    ["Titles, descriptions, etc. Then links.", "Titles, descriptions, etc."],
```

- [ ] **Step 2: Run it to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/today/reason.test.ts`
Expected: FAIL (the "e.g." and "i.e." and "vs." rows cut at the abbreviation).

- [ ] **Step 3: Implement**

`lib/today/reason.ts`: replace the `end` search with

```ts
/** Periods that end a word, not a sentence. "etc." is left out: it usually ends one. */
const ABBREVIATION = /\b(?:e\.g|i\.e|vs|approx)\.$/i;

/** Index of the full stop, question or exclamation mark that ends the first sentence, or -1. */
function sentenceEnd(flat: string): number {
  for (const match of flat.matchAll(/[.!?](?=\s|$)/g)) {
    if (!ABBREVIATION.test(flat.slice(0, match.index + 1))) return match.index;
  }
  return -1;
}
```

and in `firstSentence` use `const end = sentenceEnd(flat);`.

- [ ] **Step 4: Run it to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/today`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add lib/today/reason.ts lib/today/reason.test.ts
git commit -m "fix(today): a reason is not cut at e.g., i.e. or vs.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plain reasons for the scan's rules

**Files:**
- Modify: `lib/scan/issue-rules.ts`, `components/design/scan-example-data.ts:88`
- Create: `lib/scan/issue-rules-plain.test.ts`

**Interfaces:**
- Consumes: `evaluateRules` from `./issues`, `RULES`, `AI_RETRIEVAL_AGENTS` from `./robots`, fixtures `ALL_OK, crawlSite, htmlPage, readiness` from `@/tests/helpers/scoring`.
- Produces: no new exports. Each rule's issue `problem` is plain; `title`, `fix`, `check`, `locations` are unchanged.

- [ ] **Step 1: Write the failing test**

`lib/scan/issue-rules-plain.test.ts`:

```ts
import { ALL_OK, crawlSite, htmlPage, readiness } from "@/tests/helpers/scoring";
import { evaluateRules } from "./issues";
import { AI_RETRIEVAL_AGENTS } from "./robots";

// What reaches the owner on the Actions board, Today and the product page: no tags, header
// names, file names or schema vocabulary. The exact wording is pinned so a change is deliberate.
const JARGON = /<|>|X-Robots-Tag|robots\.txt|llms\.txt|noindex|JSON-LD|schema|structured data|markup|meta |HTTP \d|crawl/i;
const SEARCH_AGENT = [...AI_RETRIEVAL_AGENTS][0] ?? "";
const TRAINING_ONLY = "CCBot";

/** Every rule fires: a bare page, a broken link, no llms.txt, no FAQ, one agent blocked. */
function problemsWhenBlocked(agent: string): string[] {
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
    o.state === "present" ? [o.issue.problem] : [],
  );
}

describe("rule reasons in plain words", () => {
  it("uses real fixtures: a search agent and a training-only crawler", () => {
    expect(SEARCH_AGENT).not.toBe("");
    expect(AI_RETRIEVAL_AGENTS.has(TRAINING_ONLY)).toBe(false);
  });

  it("says each reason without jargon, for the search-agent and training-only variants", () => {
    for (const agent of [SEARCH_AGENT, TRAINING_ONLY]) {
      const problems = problemsWhenBlocked(agent);
      expect(problems).toHaveLength(8);
      for (const problem of problems) expect(problem).not.toMatch(JARGON);
    }
  });

  it("pins the wording", () => {
    expect(problemsWhenBlocked(SEARCH_AGENT)).toEqual([
      "Without a title, search results and AI answers have nothing to call these pages.",
      "Without a short summary written for them, Google picks a snippet from the page text.",
      "Links on your site lead to pages that are gone or show an error, so visitors and Google hit dead ends.",
      "These pages ask search engines not to list them, so they can't be found on Google.",
      "AI assistants' search tools are blocked from reading your site, so they can't cite it.",
      "Your pages don't label their questions and answers in a way Google and AI assistants can read, so they're less likely to quote you.",
      "There's no short guide to your site written for AI assistants, so they have to guess which pages matter.",
      "Readers can't pick your site as a favourite source in Google's Top Stories.",
    ]);
    expect(problemsWhenBlocked(TRAINING_ONLY)[4]).toBe(
      "Only the tools that collect training data are blocked; AI assistants can still read and cite your site.",
    );
  });
});
```

If `readiness()`'s `Parts` type rejects a field above, copy the exact partial shapes from the `CASES` table in `lib/scan/issue-rules.test.ts`; the intent is "every rule fires".

- [ ] **Step 2: Run it to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/scan/issue-rules-plain.test.ts`
Expected: FAIL (jargon in the current text; wording differs).

- [ ] **Step 3: Implement**

In `lib/scan/issue-rules.ts`, replace each rule's `problem` (nothing else in the rules changes):

- `missingTitle`: `"Without a title, search results and AI answers have nothing to call these pages."`
- `missingDescription`: `"Without a short summary written for them, Google picks a snippet from the page text."`
- `brokenLinks`: `"Links on your site lead to pages that are gone or show an error, so visitors and Google hit dead ends."`
- `noindex`: `"These pages ask search engines not to list them, so they can't be found on Google."`
- `aiCrawlersBlocked`:
  ```ts
      problem: search
        ? "AI assistants' search tools are blocked from reading your site, so they can't cite it."
        : "Only the tools that collect training data are blocked; AI assistants can still read and cite your site.",
  ```
- `noFaqSchema`: `"Your pages don't label their questions and answers in a way Google and AI assistants can read, so they're less likely to quote you."`
- `noLlmsTxt`: `"There's no short guide to your site written for AI assistants, so they have to guess which pages matter."`
- `noPreferredSources`: `"Readers can't pick your site as a favourite source in Google's Top Stories."`

Update the product-page example in `components/design/scan-example-data.ts:88` to the new `missing-title` text.

- [ ] **Step 4: Run the whole affected suite**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/scan lib/actions lib/today components/products components/design`
Expected: PASS. Any failure quoting the old text is a test that bound the old wording to the real rules: update it to the new text. (Tests with their own `problem` fixtures, e.g. in `rule-sync*.test.ts` and `lib/scan/handoff.test.ts`, are unaffected.) Confirm the refresh path rewrites stored reasons: `grep -n "why" lib/actions/rule-sync.test.ts` shows the refresh plan carrying the issue's text; existing rows therefore catch up at the next scan with no migration.

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add lib/scan/issue-rules.ts lib/scan/issue-rules-plain.test.ts components/design/scan-example-data.ts
git commit -m "fix(scan): rule reasons are written in plain words

Reasons shown on the Actions board, Today and the product page no longer
mention tags or header names. Fix and check text stay exact: Hand to Claude
and the next scan rely on them.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Who's on it for every board card; board phrases in `lib/explain`

**Files:**
- Create: `lib/actions/status-actor.ts`, `lib/actions/status-actor.test.ts`
- Modify: `lib/actions/views.ts`, `lib/actions/views.test.ts`, `lib/explain/actions.ts`, `lib/explain/actions.test.ts`, `components/design/action-example-data.ts`

**Interfaces:**
- Consumes: `ActionActor` (Task 1), `whoIsOnIt`, `type WhoOnIt` from `@/lib/explain/actions`.
- Produces:
  - `lastStatusActor(oldestFirst: readonly { actor: ActionActor; from: string | null; to: string }[]): ActionActor | null`
  - `ActionView` gains `who: WhoOnIt | null`
  - `IMPACT_GROUP: Readonly<Record<Impact, string>>` (`"Big wins" | "Worth doing" | "Small wins"`)
  - `boardSummary(counts: { open: number; in_progress: number; suggested: number }): string`

- [ ] **Step 1: Write the failing tests**

`lib/actions/status-actor.test.ts`:

```ts
import { lastStatusActor } from "./status-actor";

const created = { actor: "scan", from: null, to: "open" } as const;
const started = (actor: "owner" | "claude") => ({ actor, from: "open", to: "in_progress" }) as const;
const prLink = { actor: "claude", from: "in_progress", to: "in_progress" } as const;

describe("lastStatusActor", () => {
  it("is who made the latest event that changed the status", () => {
    expect(lastStatusActor([created, started("claude")])).toBe("claude");
    expect(lastStatusActor([created, started("owner"), prLink])).toBe("owner");
  });
  it("counts creation", () => {
    expect(lastStatusActor([created])).toBe("scan");
  });
  // Review Focus 1: pruning can leave only PR-link events: unknown, never Claude by default.
  it("is null when pruning left no status change", () => {
    expect(lastStatusActor([prLink, prLink])).toBeNull();
    expect(lastStatusActor([])).toBeNull();
  });
});
```

Add to `lib/actions/views.test.ts` (add the imports `activeWork` from `./active-work`, `linkPullRequest` from `./pr-link`, `lastStatusActor` from `./status-actor`):

```ts
describe("boardActions who's on it", () => {
  beforeEach(() => {
    minute = 0;
  });

  it("reads each card's history as Today does", () => {
    const db = openTestDb();
    const claudes = add(db, { title: "claude's" });
    setStatus(db, claudes, "open", "in_progress", { actor: "claude", note: "On it", now: at(50) });
    const waiting = add(db, { title: "owner's, with a PR" });
    setStatus(db, waiting, "open", "in_progress", { actor: "owner", now: at(51) });
    linkPullRequest(db, {
      id: waiting,
      url: "https://github.com/example/site/pull/7",
      productIds: PRODUCTS,
      now: at(52),
    });
    add(db, { title: "plain open" });
    add(db, { title: "finished", status: "done" });

    const cards = boardActions(db, { ...ACTIVE_ALL, status: "all" }, PRODUCTS).groups.flatMap(
      (g) => g.actions,
    );
    expect(Object.fromEntries(cards.map((c) => [c.title, c.who]))).toEqual({
      "claude's": "claude",
      "owner's, with a PR": "pr_waiting",
      "plain open": "you",
      finished: null,
    });
    // The board's reading and activeWork's SQL agree for every active action.
    for (const work of activeWork(db, PRODUCTS)) {
      const card = cards.find((c) => c.id === work.id);
      expect(work.statusActor).toBe(lastStatusActor(card?.events ?? []));
    }
  });
});
```

Add to `lib/explain/actions.test.ts` (import `IMPACT_GROUP`, `boardSummary`):

```ts
describe("board phrases", () => {
  it("heads the impact groups in the spec's words, plural", () => {
    expect(IMPACT_GROUP).toEqual({ high: "Big wins", medium: "Worth doing", low: "Small wins" });
  });
  it("sums the board up in one plain line", () => {
    expect(boardSummary({ open: 3, in_progress: 1, suggested: 2 })).toBe(
      "3 to do · 1 in progress · 2 new ideas",
    );
    expect(boardSummary({ open: 0, in_progress: 0, suggested: 1 })).toBe(
      "0 to do · 0 in progress · 1 new idea",
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/actions/status-actor.test.ts lib/actions/views.test.ts lib/explain/actions.test.ts`
Expected: FAIL (modules and exports missing; `who` undefined).

- [ ] **Step 3: Implement**

`lib/actions/status-actor.ts`:

```ts
import type { ActionActor } from "./types";

type StatusEvent = { actor: ActionActor; from: string | null; to: string };

/**
 * Who made the latest status change in a history (oldest first): creation counts, a PR link (an
 * event from a status to itself) does not. Null when pruning left no status change. The same
 * rule as the SQL in active-work.ts; views.test.ts keeps the two in step.
 */
export function lastStatusActor(oldestFirst: readonly StatusEvent[]): ActionActor | null {
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    const event = oldestFirst[i];
    if (event && (event.from === null || event.from !== event.to)) return event.actor;
  }
  return null;
}
```

`lib/explain/actions.ts`: append

```ts
/** The Actions board's group headings: a group holds many, so these are plural. */
export const IMPACT_GROUP: Readonly<Record<Impact, string>> = {
  high: "Big wins",
  medium: "Worth doing",
  low: "Small wins",
};

/** The board header's line: "3 to do · 1 in progress · 2 new ideas". */
export function boardSummary(counts: { open: number; in_progress: number; suggested: number }) {
  const ideas = counts.suggested === 1 ? "idea" : "ideas";
  return `${counts.open} to do · ${counts.in_progress} in progress · ${counts.suggested} new ${ideas}`;
}
```

`lib/actions/views.ts`: add `import { type WhoOnIt, whoIsOnIt } from "@/lib/explain/actions";` and `import { lastStatusActor } from "./status-actor";`; add to `ActionView`:

```ts
  /** Who's on it (spec §3); null for done, snoozed and dismissed. */
  who: WhoOnIt | null;
```

and in `toViews`' returned object:

```ts
      who: whoIsOnIt({
        status: row.status,
        prUrl: row.prUrl,
        statusActor: lastStatusActor(history),
      }),
```

`components/design/action-example-data.ts`: `exampleActionView` default `who: "you"` (before `...over`); `EXAMPLE_ACTIONS`: suggested → `who: "undecided"`, the in-progress example (it has a PR) → `who: "pr_waiting"`, snoozed/done/dismissed → `who: null`.

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run lib/actions lib/explain && pnpm typecheck`
Expected: PASS (typecheck lists any other place that builds an `ActionView`; give each `who: null` unless it is a card fixture where a real value reads better).

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add lib components/design/action-example-data.ts
git commit -m "feat(actions): board cards know who's on them

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Plain wording for statuses, controls, filters, history, empty states and messages

**Files:**
- Modify: `components/actions/action-labels.ts`, `ActionFilters.tsx`, `ActionHistory.tsx`, `ActionBoard.tsx`, `ActionStatusControls.tsx`, `SyncFailureNote.tsx`, `app/(app)/actions/page.tsx`, `components/products/IssueItem.tsx`, `components/design/ActionExamples.tsx`
- Create: `components/actions/action-labels.test.ts`
- Modify (tests): `ActionBoard.test.tsx`, `ActionFilters.test.tsx`, `ActionStatusControls.test.tsx`, `ActionCard.test.tsx` (card text only; the card itself is Task 6), `components/products/IssueItem*.test.tsx`

**Interfaces:**
- Consumes: `STATUS_COLUMN`, `IMPACT_GROUP`, `IMPACT_PHRASE`, `boardSummary` (Task 4), `AREAS`, `AREA_ORDER`, `areaKeyOf` from `@/lib/explain/areas`, `EmptyState` (`{ what, when, why }`) from `@/components/explain/EmptyState`.
- Produces from `action-labels.ts`: `SOURCE_LABEL`, `ACTOR_LABEL`, `STATUS_FILTER_LABEL`, `EMPTY_STATE: Record<ActionFilter["status"], { what: string; when: string; why: string }>`, `DEMO_NOTE`, `type StatusControl`, `STATUS_CONTROLS`. **Removed:** `IMPACT_LABEL`, `STATUS_LABEL`, `EFFORT_LABEL`, `EMPTY_MESSAGE` (the words now come from `lib/explain/actions.ts`).

- [ ] **Step 1: Write the failing test**

`components/actions/action-labels.test.ts`:

```ts
import { checkTransition } from "@/lib/actions/transitions";
import { ACTION_STATUSES } from "@/lib/actions/types";
import { STATUS_COLUMN } from "@/lib/explain/actions";
import { ACTOR_LABEL, EMPTY_STATE, STATUS_CONTROLS, STATUS_FILTER_LABEL } from "./action-labels";

describe("STATUS_CONTROLS", () => {
  it("offers exactly the moves the server allows from each status", () => {
    for (const status of ACTION_STATUSES) {
      for (const { to } of STATUS_CONTROLS[status]) {
        const change = to === "snoozed" ? { to, until: "2026-10-05" } : { to };
        expect(checkTransition(status, change, "2026-10-02")).toBeNull();
      }
    }
  });

  it("words the buttons with the board's column names", () => {
    const labels = (status: (typeof ACTION_STATUSES)[number]) =>
      STATUS_CONTROLS[status].map((c) => c.label);
    expect(labels("suggested")).toEqual(["Accept", "Dismiss"]);
    expect(labels("open")).toEqual(["Start", "Mark done", "Snooze…", "Dismiss"]);
    expect(labels("in_progress")).toEqual([
      "Move back to To do",
      "Mark done",
      "Snooze…",
      "Dismiss",
    ]);
    expect(labels("snoozed")).toEqual(["Bring back now", "Mark done", "Dismiss"]);
    expect(labels("done")).toEqual(["Move back to To do"]);
    expect(labels("dismissed")).toEqual(["Restore to To do"]);
  });
});

describe("filter and empty-state wording", () => {
  it("names the status filter in the board's columns", () => {
    expect(STATUS_FILTER_LABEL).toEqual({
      active: "To do and in progress",
      suggested: STATUS_COLUMN.suggested,
      snoozed: STATUS_COLUMN.snoozed,
      done: STATUS_COLUMN.done,
      dismissed: STATUS_COLUMN.dismissed,
      all: "Everything",
    });
  });

  it("answers what, when and why for every empty filter", () => {
    for (const parts of Object.values(EMPTY_STATE)) {
      for (const text of Object.values(parts)) expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("calls the scan Harbour's scan in a card's history", () => {
    expect(ACTOR_LABEL.scan).toBe("Harbour's scan");
  });
});
```

Update the existing tests to the new wording (they fail until Step 3 is done): `ActionBoard.test.tsx` 409 message → `"This card changed since you opened it, so Harbour refreshed the board. Check it and try again."`; `ActionFilters.test.tsx` status option "Suggested" → "New ideas" and the area options' visible names (values stay `SEO`/`GEO`/`AEO`); `ActionStatusControls.test.tsx` labels per the table above (e.g. "Back to open" → "Move back to To do", "Reject" → "Dismiss", "Wake now" → "Bring back now", the `done` announcements below); `IssueItem` tests ("High impact" → "Big win", "Open" → "To do").

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run components/actions components/products`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/actions/action-labels.ts` (replace the file; ~75 lines):

```ts
import type { StatusChange } from "@/lib/actions/transitions";
import type { ActionActor, ActionStatus } from "@/lib/actions/types";
import type { ActionFilter } from "@/lib/actions/views";
import { STATUS_COLUMN } from "@/lib/explain/actions";

/** Where an action came from, in Technical details. */
export const SOURCE_LABEL = {
  rule: "Found by a scan",
  agent: "Suggested by the weekly analyst",
} as const;

/** Who made a change, in the card's history. */
export const ACTOR_LABEL: Record<ActionActor, string> = {
  owner: "You",
  claude: "Claude",
  scan: "Harbour's scan",
  agent: "Weekly analyst",
  system: "Harbour",
};

/** Status filter options, in menu order; the default comes first. URL values stay the stored statuses. */
export const STATUS_FILTER_LABEL: Record<ActionFilter["status"], string> = {
  active: "To do and in progress",
  suggested: STATUS_COLUMN.suggested,
  snoozed: STATUS_COLUMN.snoozed,
  done: STATUS_COLUMN.done,
  dismissed: STATUS_COLUMN.dismissed,
  all: "Everything",
};

/** What the board says when a filter matches nothing: what appears here, when, and why. */
export const EMPTY_STATE: Record<
  ActionFilter["status"],
  { what: string; when: string; why: string }
> = {
  active: {
    what: "Nothing to do right now.",
    when: "New things show up after each scan and each weekly report.",
    why: "Until then nothing is waiting on you.",
  },
  suggested: {
    what: "No new ideas waiting.",
    when: "The weekly analyst adds ideas with each report, on Sundays.",
    why: "You decide which ones to accept.",
  },
  snoozed: {
    what: "Nothing is snoozed.",
    when: "A snoozed item comes back on the date you pick.",
    why: "You can snooze anything on your to-do list.",
  },
  done: {
    what: "Nothing is done yet.",
    when: "Finished items, and problems a scan no longer finds, appear here.",
    why: "They stay so you can see what changed.",
  },
  dismissed: {
    what: "Nothing is dismissed.",
    when: "Items you dismiss appear here.",
    why: "You can bring any of them back.",
  },
  all: {
    what: "No actions yet.",
    when: "They arrive after each scan and each weekly report.",
    why: "Run Scan now on a product page to get the first ones.",
  },
};

/** What a /design example says instead of changing anything. */
export const DEMO_NOTE = "Example only — nothing changed";

/** One status button: its label, the status it moves to, and what is announced after. */
export type StatusControl = { label: string; to: StatusChange["to"]; done: string };

const DONE: StatusControl = { label: "Mark done", to: "done", done: "Marked done" };
const SNOOZE: StatusControl = { label: "Snooze…", to: "snoozed", done: "Snoozed" };
const DISMISS: StatusControl = { label: "Dismiss", to: "dismissed", done: "Dismissed" };
const BACK: StatusControl = { label: "Move back to To do", to: "open", done: "Moved back to To do" };

/** The owner's buttons per status: exactly the transitions the server allows. */
export const STATUS_CONTROLS: Record<ActionStatus, readonly StatusControl[]> = {
  suggested: [{ label: "Accept", to: "open", done: "Accepted, now in To do" }, DISMISS],
  open: [{ label: "Start", to: "in_progress", done: "Started" }, DONE, SNOOZE, DISMISS],
  in_progress: [BACK, DONE, SNOOZE, DISMISS],
  snoozed: [{ label: "Bring back now", to: "open", done: "Brought back to To do" }, DONE, DISMISS],
  done: [BACK],
  dismissed: [{ label: "Restore to To do", to: "open", done: "Restored to To do" }],
};
```

`ActionFilters.tsx`: drop the local `AREAS` constant; import `AREAS, AREA_ORDER` from `@/lib/explain/areas` and render

```tsx
          {AREA_ORDER.map((key) => (
            <option key={key} value={AREAS[key].code}>
              {AREAS[key].name}
            </option>
          ))}
```

(the value stays the stored code, so `?area=GEO` bookmarks work). `ActionFilters` keeps "All areas".

`ActionHistory.tsx`: `STATUS_LABEL` → `STATUS_COLUMN` from `@/lib/explain/actions` (`created as To do`, `New ideas → To do`); "Older history pruned." → `"Older history was cleared to save space."`.

`ActionBoard.tsx`: heading text `IMPACT_GROUP[impact]`; the empty state

```tsx
        <EmptyState {...EMPTY_STATE[filter.status]} />
```

and the cap line `{more} more aren't shown. Use the filters above to narrow the list.` (imports: `EmptyState` from `@/components/explain/EmptyState`, `IMPACT_GROUP` from `@/lib/explain/actions`, `EMPTY_STATE` from `./action-labels`).

`ActionStatusControls.tsx` `failureMessage` (what happened, what to do):

```ts
function failureMessage(error: string): string {
  if (error === "unauthenticated") {
    return "Your sign-in has ended. Reload the page and sign in again, then try again.";
  }
  if (error === "until_invalid") return "Pick a date between tomorrow and a year from now.";
  if (CHANGED.has(error)) {
    return "This card changed since you opened it, so Harbour refreshed the board. Check it and try again.";
  }
  return "That change wasn't saved. Try again in a moment.";
}
```

`SyncFailureNote.tsx`: the list item reads

```tsx
          {productName}: the list below may be out of date. The last scan finished, but Harbour
          couldn't update the actions ({formatDateTime(at, timeZone, locale)}). The next scan
          tries again.
```

`app/(app)/actions/page.tsx`: the header's second line becomes

```tsx
        <p className="mt-1 text-sm text-ink-muted">
          Things worth doing to get found more easily. You decide what happens to each.
        </p>
        <p className="mt-1 text-sm text-ink-muted tabular-nums">{boardSummary(counts)}</p>
```

with `import { boardSummary } from "@/lib/explain/actions";`.

`components/products/IssueItem.tsx`: import `IMPACT_PHRASE, STATUS_COLUMN` from `@/lib/explain/actions` instead of the deleted labels (`IMPACT_PHRASE[issue.impact]`, `STATUS_COLUMN[action.status]`); nothing else on that page changes (step 4).

`components/design/ActionExamples.tsx`: `STATUS_LABEL[status]` → `STATUS_COLUMN[status]`.

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run components lib/explain && pnpm typecheck`
Expected: PASS except `ActionCard.test.tsx` rows about card text, which Task 6 rewrites; fix only the ones that fail purely on renamed wording now: "Open" tag → "To do", "From scan" → "Found by a scan".

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add components app lib
git commit -m "feat(actions): plain wording for statuses, filters, history and messages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cards lead with the plain words; the technical parts fold away

**Files:**
- Modify: `components/actions/ActionCard.tsx`, `components/actions/ActionEvidence.tsx`, `components/actions/ActionCard.test.tsx`
- Create: `components/actions/ActionTechnical.tsx`

**Interfaces:**
- Consumes: `TechnicalDetails({ id, topic, children })` from `@/components/explain/TechnicalDetails`; `IMPACT_PHRASE, EFFORT_PHRASE, STATUS_COLUMN, WHO_PHRASE`; `AREAS, areaKeyOf`; `ActionView.who`.
- Produces: `ActionTechnical({ action, product }: { action: ActionView; product: Product })`: a server component rendering `<TechnicalDetails id="action-card" topic="evidence, source and the prompt for Claude">`.

- [ ] **Step 1: Write the failing tests**

Replace the first two tests of `components/actions/ActionCard.test.tsx` ("renders every field", "shows the snooze date and the analyst as the source") with:

```tsx
  it("leads with the plain title, reason, impact, effort, status and who's on it", () => {
    const card = renderCard();
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(
      "3 pages have no title",
    );
    for (const text of [
      "Big win",
      "Found on Google · quick job",
      "To do",
      "Acme Docs",
      "Waiting for you",
    ]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(card).toHaveTextContent("Search results show a generated title");
    // Codes and the old effort wording are gone from the surface.
    expect(within(card).queryByText("SEO")).toBeNull();
    expect(within(card).queryByText("Small")).toBeNull();
  });

  it("keeps the fix, source, rule key, evidence, docs and prompt inside Technical details", () => {
    const card = renderCard();
    const details = within(card).getByText("Technical details", { exact: false }).closest("details");
    if (!details) throw new Error("the card has no Technical details");
    const inside = within(details);
    for (const text of [
      "Fix",
      "Give each page a unique title of 10–60 characters.",
      "Done when",
      "Every page has a title.",
      "Found by a scan",
      "missing-title",
      "Evidence (3)",
      "…and 1 more",
    ]) {
      expect(inside.getByText(text)).toBeInTheDocument();
    }
    expect(inside.getByRole("link", { name: "research/acme-docs/seo.md" })).toHaveAttribute(
      "href",
      "/brain/research/acme-docs/seo.md",
    );
    // A closed <details> hides its body from the accessibility tree; the button keeps its name.
    expect(
      inside.getByRole("button", { name: "Hand to Claude: 3 pages have no title", hidden: true }),
    ).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
    expect(within(card).getByText("History")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Mark done: 3 pages have no title" }),
    ).toBeVisible();
  });

  it("shows the snooze date, and the analyst as the source inside Technical details", () => {
    const card = renderCard({
      status: "snoozed",
      snoozedUntil: "2026-10-12",
      source: "agent",
      ruleKey: null,
      who: null,
    });
    expect(within(card).getByText("Snoozed until 12 Oct 2026")).toBeInTheDocument();
    expect(within(card).getByText("Suggested by the weekly analyst")).toBeInTheDocument();
    expect(within(card).queryByText("Waiting for you")).toBeNull();
  });

  it.each([
    ["claude", "Claude is on it"],
    ["pr_waiting", "Pull request waiting for your OK"],
    ["undecided", "New idea, not decided yet"],
  ] as const)("says %s as %j", (who, phrase) => {
    const card = renderCard({ who });
    expect(within(card).getByText(phrase)).toBeInTheDocument();
  });

  it("links the pull request on the card, outside Technical details", () => {
    const card = renderCard({
      status: "in_progress",
      who: "pr_waiting",
      prUrl: "https://github.com/example/site/pull/42",
    });
    const link = within(card).getByRole("link", { name: /Pull request example\/site#42/ });
    expect(link.closest("details")?.querySelector("summary")?.textContent).not.toContain(
      "Technical",
    );
  });

  // Review Focus 5: unreadable stored evidence is a gap, and the rest of the section stays.
  it("says when stored evidence could not be read and keeps the other technical parts", () => {
    const card = renderCard({ evidenceInvalid: true, evidence: { items: [], total: 0 } });
    expect(within(card).getByText("Harbour could not read the stored evidence.")).toBeInTheDocument();
    expect(within(card).getByText("Every page has a title.")).toBeInTheDocument();
  });
```

Keep the existing tests that remain true (plain-text rendering of agent markup, missing docs, history); fix wording-only failures.

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run components/actions/ActionCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`components/actions/ActionEvidence.tsx`: drop the inner `<details>`; the function body after the two early returns becomes

```tsx
  const more = evidence.total - evidence.items.length;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-ink">Evidence ({evidence.total})</p>
      <ul className="flex flex-col gap-0.5 break-all text-ink-muted">
        {/* …the same <li> mapping and the "…and {more} more" item as today… */}
      </ul>
    </div>
  );
```

Update its doc comment ("The evidence behind an action; a value that failed validation is a gap"). Keep the `invalid` message line as is.

`components/actions/ActionTechnical.tsx`:

```tsx
import Link from "next/link";
import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { CopyPromptButton } from "@/components/ui/CopyPromptButton";
import { actionHandoffPrompt } from "@/lib/actions/handoff";
import type { ActionView } from "@/lib/actions/views";
import { brainHref } from "@/lib/brain/wikilinks";
import type { Product } from "@/lib/products/catalog";
import { ActionEvidence } from "./ActionEvidence";
import { SOURCE_LABEL } from "./action-labels";

function DocLinks({ links, invalid }: { links: ActionView["docLinks"]; invalid: boolean }) {
  if (invalid) return <p className="text-ink-muted">Harbour could not read the related docs.</p>;
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Related docs">
      {links.map(({ path, exists }) => (
        <li key={path} className="break-all font-mono">
          {exists ? (
            <Link
              href={brainHref(path)}
              className="rounded-sm text-accent underline underline-offset-2"
            >
              {path}
            </Link>
          ) : (
            <span className="text-ink-muted">{path} (not in the brain)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * What the owner rarely needs but Claude and the curious do: the exact fix and check, where the
 * action came from, its rule, the evidence, related docs and the "Hand to Claude" prompt.
 */
export function ActionTechnical({ action, product }: { action: ActionView; product: Product }) {
  return (
    <TechnicalDetails id="action-card" topic="evidence, source and the prompt for Claude">
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-muted">Fix</dt>
          <dd>{action.fix}</dd>
          <dt className="text-ink-muted">Done when</dt>
          <dd>{action.check}</dd>
          <dt className="text-ink-muted">Source</dt>
          <dd>{SOURCE_LABEL[action.source]}</dd>
          {action.ruleKey && (
            <>
              <dt className="text-ink-muted">Rule</dt>
              <dd className="font-mono">{action.ruleKey}</dd>
            </>
          )}
        </dl>
        <ActionEvidence evidence={action.evidence} invalid={action.evidenceInvalid} />
        <DocLinks links={action.docLinks} invalid={action.docsInvalid} />
        <CopyPromptButton prompt={actionHandoffPrompt(product, action)} title={action.title} />
      </div>
    </TechnicalDetails>
  );
}
```

`components/actions/ActionCard.tsx` (replace the file; ~100 lines, under the 200 soft limit):

```tsx
import { Panel } from "@/components/ui/Panel";
import { ProductDot } from "@/components/ui/ProductDot";
import { Tag } from "@/components/ui/Tag";
import type { ActionView } from "@/lib/actions/views";
import { EFFORT_PHRASE, IMPACT_PHRASE, STATUS_COLUMN, WHO_PHRASE } from "@/lib/explain/actions";
import { AREAS, areaKeyOf } from "@/lib/explain/areas";
import { formatIsoDay } from "@/lib/format/date";
import type { Product } from "@/lib/products/catalog";
import { ActionHistory } from "./ActionHistory";
import { ActionStatusControls } from "./ActionStatusControls";
import { ActionTechnical } from "./ActionTechnical";
import { PullRequestLink } from "./PullRequestLink";

function statusText(action: ActionView, locale: string): string {
  if (action.status === "snoozed" && action.snoozedUntil) {
    return `Snoozed until ${formatIsoDay(action.snoozedUntil, locale)}`;
  }
  return STATUS_COLUMN[action.status];
}

/**
 * One action on the board: the plain title, why it matters, how big and how much of a win, who's
 * on it and its pull request; the technical parts are folded away. Every text field is rendered
 * as plain text: agent-written titles and reasons are untrusted.
 */
export function ActionCard({
  action,
  product,
  locale,
  timeZone,
  today,
  demo = false,
}: {
  action: ActionView;
  product: Product;
  locale: string;
  timeZone: string;
  /** YYYY-MM-DD in HARBOUR_TIMEZONE. */
  today: string;
  /** /design examples: the controls never call the API. */
  demo?: boolean;
}) {
  const headingId = `action-${action.id}-title`;
  return (
    <Panel className="p-4">
      <article
        id={`action-${action.id}`}
        aria-labelledby={headingId}
        data-action-id={action.id}
        data-impact={action.impact}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={action.impact === "high" ? "warn" : "neutral"}>
            {IMPACT_PHRASE[action.impact]}
          </Tag>
          <Tag tone="accent">
            {AREAS[areaKeyOf(action.area)].name} · {EFFORT_PHRASE[action.effort]}
          </Tag>
          <Tag tone={action.status === "suggested" ? "accent" : "neutral"}>
            {statusText(action, locale)}
          </Tag>
          <span className="inline-flex items-center gap-1.5 px-1 text-2xs text-ink-muted">
            <ProductDot product={product} />
            {product.name}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h3 id={headingId} tabIndex={-1} className="text-base font-medium text-ink">
            {action.title}
          </h3>
          <p className="text-sm text-ink-muted">{action.why}</p>
          {action.who && <p className="text-sm text-ink">{WHO_PHRASE[action.who]}</p>}
        </div>
        <PullRequestLink url={action.prUrl} />
        <ActionHistory
          events={action.events}
          truncated={action.historyTruncated}
          timeZone={timeZone}
          locale={locale}
        />
        <div className="border-t border-line pt-3">
          <ActionStatusControls
            id={action.id}
            title={action.title}
            status={action.status}
            today={today}
            demo={demo}
          />
        </div>
        <ActionTechnical action={action} product={product} />
      </article>
    </Panel>
  );
}
```

(Effort is a plain phrase beside the area, as on Today's cards, so "quick job" never stands alone without context.)

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm vitest run components && pnpm typecheck`
Expected: PASS. Also open `/design` (`pnpm dev`, then the Actions section) in light and dark: every card shows the plain tags, a "Waiting for you" / PR / "New idea" line where it applies, and a closed Technical details with the prompt button inside.

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add components
git commit -m "feat(actions): cards lead with plain words; technical parts fold away

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: E2E: the Actions page in plain words, and the smoke test

**Files:**
- Modify: `tests/e2e/actions.spec.ts`, `tests/e2e/plain-language.ts`

**Interfaces:**
- Consumes: `expectPlainLanguage` (extended here), the board as built in Tasks 4–6.
- Produces: `expectPlainLanguage(page)` additionally rejects markup and header jargon outside Technical details.

- [ ] **Step 1: Extend the smoke check, and write the failing e2e changes**

`tests/e2e/plain-language.ts`: add to `expectPlainLanguage` after the existing text checks

```ts
  // Rule reasons once leaked tags and header names (spec §5.3, step 3).
  expect(text).not.toMatch(/<\/?[a-z][^>]*>|X-Robots-Tag|JSON-LD/i);
```

and update the doc comment to mention markup.

`tests/e2e/actions.spec.ts` (each edit follows the old assertion it replaces):

- Imports: add `import { expectPlainLanguage } from "./plain-language";`.
- `headerCounts`: the text is `"3 to do · 1 in progress · 2 new ideas"`:
  ```ts
  const text = await page.getByText(/^\d+ to do · \d+ in progress · \d+ new ideas?$/).textContent();
  ```
- Add a helper below `card`:
  ```ts
  const TECHNICAL = "Technical details (evidence, source and the prompt for Claude)";
  /** Opens a card's Technical details unless the owner's remembered choice already has. */
  async function openTechnical(page: Page, title: string) {
    const details = card(page, title).locator("details", { hasText: "Technical details" });
    if (!(await details.evaluate((el: HTMLDetailsElement) => el.open))) {
      await details.getByText("Technical details").click();
    }
    return details;
  }
  ```
- Test 1 ("the sidebar counts…"): rename "…and the board groups them, biggest wins first"; the first level-2 heading text `"High impact"` → `"Big wins"` (both occurrences); `getByRole("region", { name: "High impact" })` → `"Big wins"`; `toContainText("Suggested")` → `"New ideas"`; `name: "Low impact"` → `"Small wins"`. After the cards are checked, add:
  ```ts
  await expect(page.getByText(/^\d+ to do · \d+ in progress · \d+ new ideas?$/)).toBeVisible();
  await expectPlainLanguage(page);
  const acme = card(page, "1 page has no title", "Acme Docs");
  await expect(acme.getByText("Big win", { exact: true })).toBeVisible();
  await expect(acme.getByText("Waiting for you")).toBeVisible();
  ```
  Also `await page.goto("/actions?status=all"); await expectPlainLanguage(page);` (Technical details stay closed, so evidence and rule keys are out of the checked text).
- Filters test: `selectOption({ label: "Suggested" })` → `{ label: "New ideas" }`; leave `selectOption("GEO")` (the value) and add `await expect(page.getByLabel("Area", { exact: true })).toContainText("Recommended by AI assistants");` before applying.
- Accept/start/done test: `changeStatus(page, SUGGESTED.aeo, "Accept", "To do")`; history expectation `"You · New ideas → To do"`; the later "Start" step's tag stays "In progress".
- Snooze test: button name `Wake now: ${title}` → `Bring back now: ${title}`; `"Nothing snoozed."` → `"Nothing is snoozed."`; final tag `"Open"` → `"To do"`.
- Hand to Claude test: before `getByRole("button", { name: \`Hand to Claude: ${…}\` })` add `await openTechnical(page, SUGGESTED.geo);`.
- Today/product-page test: `issue.getByText("Open", { exact: true })` → `"To do"`.
- Keyboard test: after the page loads add `await openTechnical(page, title);` is NOT used (the point is the closed path). Replace the controls loop's terminator and expectations:
  ```ts
  for (let i = 0; i < 15 && stops.at(-1) !== TECHNICAL; i++) {
  ```
  `const controls = ["Start", "Mark done", "Snooze…", "Dismiss"].map((label) => \`${label}: ${title}\`);` ; `expect(stops).toContain("History"); expect(stops.at(-1)).toBe(TECHNICAL);`. In the snooze-form walk, the last stop after "Cancel snooze" is now `TECHNICAL` instead of `Hand to Claude: ${title}`; then `Shift+Tab; Enter` as before. Add at the end of the test, after the snooze form closes:
  ```ts
  await trigger.focus();
  await page.keyboard.press("Tab"); // Dismiss, then the Technical details summary
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    card(page, title).getByRole("button", { name: `Hand to Claude: ${title}` }),
  ).toBeVisible();
  ```
  (Snooze… → Dismiss → summary: the third Tab lands on the summary only if the order is Snooze…, Dismiss, summary; adjust the count to the real order if the run says otherwise, and keep the assertion that Enter on the summary reveals the button.)

- [ ] **Step 2: Run to verify the old state fails**

Run: `source ~/.nvm/nvm.sh && pnpm test:e2e -- tests/e2e/actions.spec.ts`
Expected: with Tasks 1–6 in place this should PASS; run it before the edits above to see the old assertions fail on the new wording (a quick check that the spec really exercises the new UI), then apply them.

- [ ] **Step 3: Fix what the run shows**

Run the whole e2e suite once (`pnpm test:e2e`): the `expectPlainLanguage` tightening also runs on Today (scans.spec.ts, shell.spec.ts). A failure there is a real leak of `<tag>`/header jargon from a rule reason that Task 3 missed or a page this plan does not own: fix the text if it is a rule reason, otherwise report it as a finding instead of loosening the regex.

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && pnpm test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
source ~/.nvm/nvm.sh && pnpm fix && pnpm check
git add tests/e2e
git commit -m "test(e2e): the Actions page in plain words, with the plain-language smoke check

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README, spec notes and full verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-02-plain-language-ux-design.md`

- [ ] **Step 1: README**

Update, in this order (line numbers as of this plan; find them by text):

1. Features, **Actions board** bullet (~line 38): replace the whole bullet with

   > **Actions board** — every issue the scan finds becomes a tracked action, grouped as Big wins, Worth doing and Small wins. Each card says what to do in plain words, why it matters, how big a job it is (a quick job, an afternoon or a project), who's on it (a new idea not decided yet, Claude is on it, a pull request waiting for your OK, or waiting for you) and links its pull request. Evidence, where it came from, the exact fix and check, and **Hand to Claude** (a ready prompt) sit under **Technical details**. Filter by product, area and status (a plain, bookmarkable form); move an action through New ideas → To do → In progress → Done, snooze it until a date or dismiss it. The sidebar shows how many are open. Claude can triage the board for you with `pnpm actions`, every change recorded with its reason.

2. Routes table (~line 76): keep the query string (`status=active|suggested|snoozed|done|dismissed|all`) and add: "the status values are the stored ones; the board shows them as New ideas (`suggested`), To do (`open`), In progress, Done, Snoozed and Dismissed".
3. Weekly analyst, "Where suggestions appear" (~line 195): "as **Suggested**" → "as **New ideas**"; "accept or reject each one" → "accept or dismiss each one".
4. Product page paragraph (~line 599): "(open, in progress, snoozed …)" → "(to do, in progress, snoozed until a date, dismissed, or done but still found in the last scan)".
5. **Actions** paragraph (~line 603–614): replace `says "Actions may be out of date: the last sync failed" with the time` with `says the list may be out of date, that the last scan finished but couldn't update the actions (with the time), and that the next scan tries again`, and add one sentence: "Reasons are written in plain words; actions raised before a wording change keep the old text until the next scan refreshes them."
6. **The Actions board** paragraph (~line 615–626): rewrite for the new wording: shows To do and In progress by default, grouped Big wins → Worth doing → Small wins; "Each card offers only the moves its status allows (**Start**, **Mark done**, **Snooze…** with a date from tomorrow to a year ahead, **Dismiss**, **Move back to To do**, **Bring back now**, **Restore to To do**; new ideas from the weekly analyst are **Accept**ed or **Dismiss**ed)"; "**History** lists every change with who made it (**You**, **Claude**, **Harbour's scan**…)"; "**Hand to Claude** … sits under **Technical details** on each card, which remembers whether you opened it".

- [ ] **Step 2: Spec note**

In the spec §5.3 add a short "As built" list: the board stays a grouped list filtered by status (the six names are used for tags, filter, counts, history and controls); group headings "Big wins / Worth doing / Small wins"; rule reasons are plain in `lib/scan/issue-rules.ts` while `fix` and `check` stay exact and sit under Technical details; the fix, check, source, rule key, evidence, related docs and "Hand to Claude" share one Technical details section per card. In §8 mark step 3 done.

- [ ] **Step 3: Verify every README claim**

Run: `source ~/.nvm/nvm.sh && pnpm check && pnpm test:e2e`
Expected: PASS. Then `grep -n "Suggested\|Wake now\|Reject\|Back to open\|may be out of date: the last sync" README.md components app` returns nothing stale (the first may legitimately remain in `pnpm actions` CLI text, which uses stored status values; leave those).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-10-02-plain-language-ux-design.md
git commit -m "docs: the Actions board in plain words

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage.** §3 columns and wording: Tasks 4–6 (`STATUS_COLUMN` everywhere, `IMPACT_PHRASE`/`EFFORT_PHRASE`). §3 who's on it: Task 4 (`lastStatusActor`, parity test) and Task 6 (card line). §5.3 card contents and Technical details: Task 6. §5.5 messages: Task 5 (empty states, stale/session errors, sync note, cap line, history pruning). §2 principles 4 and 5: Tasks 3, 5. Rule jargon on cards and Today: Task 3 (and Task 7's smoke check on Today and Actions). Accept/dismiss/snooze accessibility: unchanged components, labels pinned (Task 5), keyboard path e2e (Task 7). E2E smoke on Actions: Task 7. README: Task 8. Deferred items: `ACTION_ACTORS` Task 1, `firstSentence` Task 2, "Worth doing" naming Decision 8.
- **Placeholders.** None: the only "adjust to the real order" note is the Tab count in the keyboard test, which depends on DOM order verified by running it.
- **Type consistency.** `lastStatusActor`, `ActionView.who`, `IMPACT_GROUP`, `boardSummary`, `EMPTY_STATE`, `ActionTechnical`, `TECHNICAL` topic string are used with the same names in later tasks; `IMPACT_LABEL`/`STATUS_LABEL`/`EFFORT_LABEL`/`EMPTY_MESSAGE` are removed in Task 5 and their last users (`IssueItem`, `ActionExamples`, `ActionBoard`, `ActionHistory`, `ActionCard`) are switched in Tasks 5–6.
- **Sizes.** `ActionCard.tsx` about 100 lines, `ActionTechnical.tsx` about 70, `action-labels.ts` about 95, `actions.spec.ts` stays under the 600-line test limit (it is 286 lines before the edits).
- **Review Focus item 4** reads clumsily above: the intended statement is that old stored text stays until the next scan and the README says so (Task 8, step 1.5); no test beyond the existing refresh coverage is added.
