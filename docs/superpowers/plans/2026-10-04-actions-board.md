# Actions board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A six-column kanban for actions (Backlog, Queue, Started, In progress, In review, Done) that the owner can drag or move by keyboard, with plain-language explainers, a Today strip, and CLI moves for the main agent.

**Architecture:** One nullable `stage` column on `actions` (and `from_stage`/`to_stage` on `action_events`) plus a pure `boardColumn()` and one `moveToColumn()` that goes through the existing `applyStatusChange` transaction. UI is server components with small client islands (native drag events plus a "Move to…" menu).

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Drizzle on SQLite, vitest, Playwright, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-actions-board-design.md`

## Global Constraints

- AGENTS.md rules apply: file limits (tsx soft 200 / hard 300, ts 300/400, tests 400/600), semantic tokens only, text in rem via the type scale, light and dark, every component on `/design`, accessible names and full keyboard path, plain language (all wording in `lib/explain/board.ts`, no codes on the card face), zod at API boundaries, no `any`, no dead code, no new dependency.
- Do not use `pnpm fix` (it rewrites escapes). Use `pnpm exec biome format --write` / `check` on your own files, then `pnpm check`.
- Migration: `pnpm db:generate` creates `drizzle/0014_*.sql`; also add a migration test beside `lib/db/migrate-jobs-result.test.ts`.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Public repo: fictional names only (the example product in `components/design/` is fictional); run `pnpm check:private` before each commit.
- Test helpers: `openTestDb()` in `tests/helpers/db.ts`, fixtures in `tests/helpers/actions.ts`, fixed time `t0 = 2026-10-02T09:00:00Z`.

## Review Focus

- A card that is `suggested` moved into any column becomes `open`/`in_progress` (accepted) with one event.
- Two movers: the second gets a plain "this card moved already" message and the UI refreshes.
- Rule-sync reopening a done card puts it back in Backlog (stage cleared).
- A stage, when set, decides the column. With no stage, `in_progress` plus a pull request link reads as In review and without a link as In progress. Moving a card that has a pull request to In progress is refused (`has_pull_request`: "This card has a pull request, so it counts as In review.").
- Snoozed and dismissed never appear as columns; Done shows only the last 14 days; the board caps at 200 cards.
- Keyboard: Move-to menu opens with Enter/Space, arrow keys choose, Escape closes, focus returns to the moved card's heading (existing `focus-after-change`).

---

### Task 1: Data model and `boardColumn`

**Files:**
- Modify: `lib/db/schema/actions.ts` (add `stage` to `actions`, `fromStage`/`toStage` to `actionEvents`); create `drizzle/0014_*.sql` via `pnpm db:generate`
- Modify: `lib/actions/types.ts`
- Create: `lib/actions/board-column.ts`, `lib/actions/board-column.test.ts`, `lib/db/migrate-action-stage.test.ts`

**Interfaces:**
- Produces:
  - `export type ActionStage = "queue" | "started" | "in_review"`; `export const ACTION_STAGES`
  - `export type BoardColumnId = "backlog" | "queue" | "started" | "in_progress" | "in_review" | "done"`; `export const BOARD_COLUMNS: readonly BoardColumnId[]` in left-to-right order
  - `export function boardColumn(row: Pick<ActionRow, "status" | "stage" | "prUrl">): BoardColumnId | null` (null for snoozed and dismissed)
  - `export function columnTarget(column: BoardColumnId): { status: "open" | "in_progress" | "done"; stage: ActionStage | null }` (backlog → open/null, queue → open/queue, started → in_progress/started, in_progress → in_progress/null, in_review → in_progress/in_review, done → done/null)
- A stage, when set, decides the column; otherwise status plus `prUrl` decide it (spec section 2). The refusal for moving a card that has a pull request to In progress lives in Task 2's `moveToColumn`.

- [ ] Step 1: write failing tests for `boardColumn` (every row of the spec table, plus snoozed/dismissed → null, suggested → backlog) and for the migration (existing rows get stage null; new columns exist).
- [ ] Step 2: add schema columns, run `pnpm db:generate`, implement `board-column.ts`, update types (`NewAction` omits nothing new since stage is nullable with default null).
- [ ] Step 3: `pnpm typecheck` and fix every `ActionRow` fixture/mocks that now needs `stage: null`.
- [ ] Step 4: `pnpm check`, commit `feat: actions get a board stage and one boardColumn function`.

### Task 2: `moveToColumn`, API and CLI

**Files:**
- Create: `lib/actions/move-to-column.ts`, `lib/actions/move-to-column.test.ts`
- Modify: `lib/actions/status-change.ts` / `store.ts` (stage cleared when status changes elsewhere; events record `fromStage`/`toStage`; `setStatus` takes optional stage), `app/api/actions/[id]/route.ts` (accept `{ from, to }` as columns when `column` is present, keep the old body working), `lib/actions/cli/*` (`move` command, `list --column`, `add --column`), CLI usage text and its tests, `lib/actions/rule-sync*.ts` only if reopening must clear stage.

**Interfaces:**
- Consumes: `boardColumn`, `columnTarget` from Task 1; `applyStatusChange` / `setStatus` (compare-and-set + event).
- Produces: `export function moveToColumn(db, { id, from: BoardColumnId, to: BoardColumnId, actor: ActionActor, note?: string, now?: Date }): { ok: true } | { ok: false; reason: "not_found" | "stale" | "same_column" | "has_pull_request" | "note_required" | "not_allowed" }` and a plain message map `MOVE_REFUSAL` in `lib/explain/board.ts` (Task 3 creates the file; here add only the reason→sentence keys in a small `lib/actions/move-refusal.ts` that Task 3 re-exports, to avoid a dependency cycle).
- Rules: moving a `suggested` card to any column other than Backlog accepts it (event from suggested); to Backlog it is also accepted as open. Claude must give a note. `from` is the column the mover believes the card is in; mismatch → `stale`. Stage is cleared by every non-move status change (done, snooze, dismiss, reopen, wake). One transaction, one event with from/to status and stage.

- [ ] Step 1: failing tests: each column pair, suggested accepting, stale, same column, has_pull_request refusal, Claude without note, stage cleared on done/snooze/reopen/wake/rule-sync reopen, event rows carry stage, CLI `move` and `list --column`, API zod rejects unknown column names and accepts the old status body unchanged.
- [ ] Step 2: implement; keep `applyStatusChange` behaviour for old callers byte-for-byte.
- [ ] Step 3: `pnpm check`, commit `feat: move an action between board columns (library, API, CLI)`.

### Task 3: Plain wording and board data

**Files:**
- Create: `lib/explain/board.ts` (+ test), `lib/actions/board-view.ts` (+ test)
- Modify: `tests/plain-vocabulary.test.ts` only if its file list needs the new paths.

**Interfaces:**
- Produces in `lib/explain/board.ts`: `COLUMN_COPY: Record<BoardColumnId, { name; short; explainer: { what; whoMoves; next; ifStuck } ; waitingOn(card): string; whatNext(card): string }>`, `MOVE_REFUSAL: Record<reason, string>`, `lastMoveLine({ actor, to, at }, now): string` ("Claude moved this to Queue, 2 days ago"), `STUCK_DAYS = { started: 7, in_progress: 7, in_review: 3 }`.
- Produces in `lib/actions/board-view.ts`: `loadBoard(db, filter, now): { columns: Record<BoardColumnId, BoardCard[]>; parked: BoardCard[]; counts; truncated: boolean }` where `BoardCard = { id; title; whyLine; productId; productName; area; impact; effort; who: WhoOnIt; column; prUrl: string | null; lastMove: { actor; to; at } | null; stuck: boolean; needsOwner: boolean; isNewIdea: boolean }`; sorted impact then oldest first; Done limited to 14 days; total cap 200 (`truncated` true when hit); unknown products skipped (existing rule); respects `product` and `area` filters from `parseActionFilter`.
- Each explainer follows the existing four-part `Explainer`; wording is plain (spec §4), says what happened, whether it matters and what to do.

- [ ] Step 1: failing tests for every column's copy (no codes: no `in_progress`, `SEO` jargon allowed only as the existing area names), stuck rules at boundaries (exactly 7 days not stuck, 8 stuck), needsOwner rules (new idea, PR waiting, owner on it), Done 14-day cut, cap, filters.
- [ ] Step 2: implement; reuse `whoIsOnIt`, `lastStatusActor`, `STATUS_COLUMN` naming where it fits and delete `STATUS_COLUMN` if it becomes unused.
- [ ] Step 3: `pnpm check`, commit `feat: board data and plain wording for each column`.

### Task 4: Board UI

**Files:**
- Create: `components/actions/board/` — `Board.tsx` (server), `BoardColumn.tsx`, `BoardCard.tsx`, `MoveMenu.tsx` (client), `useBoardDrag.ts` (client hook, native drag events), `ParkedStrip.tsx`, `ViewSwitch.tsx`, `index.ts`; tests beside each; keep each .tsx under 200 lines.
- Modify: `app/(app)/actions/page.tsx` (View switch via `?view=board|list`, Board default, keep filters and notices), `components/actions/ActionAnnouncer.tsx` only if a new announcer method is needed, `app/globals.css` or `design/` for the arrival animation tokens (use `--duration-base`; none under reduced motion).

**Interfaces:**
- Consumes: `loadBoard`, `COLUMN_COPY`, `MOVE_REFUSAL`, `BOARD_COLUMNS` (Tasks 1 to 3), `postJson` + `/api/actions/[id]` with `{ from, to }` columns, `ActionAnnouncer`, `afterChange` focus helper, `Explainer`, `Tag`, `ProductDot`, `Panel`.
- Behaviour: drag a card onto a column to move it; optimistic card placement, revert with a plain message on refusal; `Move to…` button opens a menu (Enter/Space opens, arrows choose, Escape closes, focus returns to the card heading); columns are `role="list"` regions with accessible names ("Queue, 3 cards"); live announcement "Moved <title> to Queue"; each card shows the fields in spec §4; Parked strip below with existing Wake/Bring back controls (reuse `ActionStatusControls`); `demo` prop disables network for `/design`.
- Accessibility: visible focus, targets at least 44px on touch, no information by colour alone (column icons plus text), dark mode via semantic tokens only.

- [ ] Step 1: failing component tests (render each column with counts and explainer, card fields, Move menu keyboard path, drag handlers call the API with the right body, refusal reverts and announces, demo mode sends nothing).
- [ ] Step 2: implement; page toggle; screenshot-free but verify with `pnpm build`.
- [ ] Step 3: `pnpm check`, commit `feat: kanban board for actions with drag and a keyboard move menu`.

### Task 5: Today strip and `/design`

**Files:**
- Create: `components/today/WorkStrip.tsx` (+ test), `lib/today/work-strip.ts` (+ test), `components/design/BoardExamples.tsx`, `components/design/board-example-data.ts`
- Modify: `app/(app)/page.tsx` (or the Today route) to render the strip near the top, `app/(app)/design/page.tsx` (add Section), `lib/today/*` types as needed.

**Interfaces:**
- Consumes: `loadBoard` counts and flags; `COLUMN_COPY`.
- Produces: `loadWorkStrip(db, now): { tiles: { column; name; count; href }[]; stuck: { count; href }; needsYou: { count; href; lines: string[] }; movedToday: { count; lastLine: string | null } }`; a segmented flow bar (six segments, widths from counts, text label per segment, not colour only), tiles link to `/actions?view=board&…` filters (add a `focus=stuck|needs-you` URL param handled by `loadBoard`).
- Empty and all-clear states say so in plain words ("Nothing is stuck"), never a zero without a sentence.

- [ ] Step 1: failing tests for the strip data (counts, stuck, needs you, moved today in the owner's timezone) and component render (labels, links, empty state).
- [ ] Step 2: implement, add `/design` examples (board with example cards in every column, a stuck card, a new idea card, the strip).
- [ ] Step 3: `pnpm check`, commit `feat: Today work strip and design page examples for the board`.

### Task 6: End-to-end, docs, spec "as built"

**Files:**
- Create: `tests/e2e/board.spec.ts` (+ a `projects` entry in `playwright.config.ts`, seeding through production code like `seed-actions.ts`)
- Modify: `README.md` (Actions board section: columns, moving, CLI `move`), `AGENTS.md` ("Working with other projects": the main agent keeps each card's column true; PR opened → In review, merge → Done), the spec's section 8 "As built".

- [ ] Step 1: e2e: board loads with six columns and counts, move a card with the keyboard menu, move with drag (use Playwright `dragTo`), a refused move reverts with the plain sentence, Today strip tile links to the filtered board; run on system Chrome through a TEMPORARY copy of `playwright.config.ts` with `use.channel: "chrome"` (delete afterwards).
- [ ] Step 2: docs; `pnpm check`; commit `docs: board in README, AGENTS and the spec`.
