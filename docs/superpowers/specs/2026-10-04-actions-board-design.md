# Actions board (kanban) — design

Status: requested by the owner in conversation, 3 October 2026; built overnight under that request.
Amends: `2026-10-01-harbour-design.md` (actions) and `2026-10-02-plain-language-ux-design.md` (wording).

## 1. Intent

The owner opens Harbour during the day and sees, in one glance, where every piece of work is: what is
waiting in the backlog, what is queued, started, in progress, in review and done. Behind the scenes the
main agent keeps those places true for every project, by moving cards as work really moves.

Success: the owner can answer "what is stuck, what needs me, what moved today" without opening a card,
and can move a card by dragging it or with the keyboard.

Non-goals: no manual ordering inside a column (cards sort by impact, then age); no new "projects" model
(a project is a configured product); no swimlanes; no automatic status changes from outside Harbour.

## 2. The six columns

| Column | What it means (plain words) | Backed by |
|---|---|---|
| Backlog | Ideas and jobs nobody has picked yet. New ideas from the weekly analyst wait here with a "New idea: accept or dismiss" tag. | status `suggested`, or `open` with no stage |
| Queue | Decided, and next up. | status `open`, stage `queue` |
| Started | Someone has picked it up and begun. | status `in_progress`, stage `started` |
| In progress | Being worked on now. This is where every existing in-progress action lands. | status `in_progress`, no stage and no pull request |
| In review | Work is done and waiting for a look (usually a pull request). | status `in_progress` with a pull request link and no other stage, or stage `in_review` |
| Done | Finished. Shows the last 14 days. | status `done` |

`snoozed` and `dismissed` are not columns. They sit in a quiet "Parked" strip under the board with
Wake and Bring back buttons, exactly as today.

## 3. Data

- `actions.stage` (text, nullable, `queue | started | in_review`). Migration 0014, `ALTER TABLE ADD`.
  A TS-level enum (as for `status`), no SQL CHECK. Null is the default so every existing row keeps its
  meaning.
- `action_events.from_stage` and `to_stage` (nullable) record column moves with the existing actor,
  note and time.
- One pure function, `boardColumn(row)`, is the only place that turns status, stage and pull request link
  into a column. One function, `moveToColumn`, is the only way to change a column. It sets status and
  stage together in one transaction through the existing `applyStatusChange` path (stale check,
  allowed-transition check, event row, actor). Moving a `suggested` card to any column accepts it.
- Leaving through any other status change (done, snooze, dismiss, reopen) clears `stage`.
- A move into In review needs no pull request; the card then says "Waiting for a look" and the pull
  request line stays blank until one is linked.
- Allowed moves: any column to any other, except that nothing is moved by the owner into Done from
  Backlog without a note when the actor is Claude (the existing rule: Claude always gives a note).

## 4. Screens and wording

- `/actions` gets a `View: Board | List` switch. Board is the default; the list stays for filters and
  search. The board respects the existing product and area filters in the URL.
- Each column header: name, a count chip, a small icon, and a "What's this?" `Explainer` (what it means,
  who moves cards in, what usually happens next, what to do if it is stuck).
- Each card says, in plain words: what it is (title), why it matters (first sentence of `why`), the
  project, who is on it (`whoIsOnIt`), what it is waiting on and what happens next (both from
  `lib/explain/board.ts`, per column), the last move ("Claude moved this to Queue, 2 days ago"), and the
  pull request link when there is one.
- All wording lives in `lib/explain/board.ts`. No codes on the card face; stage names and ids only inside
  `TechnicalDetails`.
- **Moving:** mouse drag and drop (native HTML5 drag events, no new dependency). Every card also has a
  "Move to…" button that opens a small menu of columns: this is the keyboard and touch path, and it is
  announced through the existing `ActionAnnouncer`. A move that fails (stale card, not allowed) puts the
  card back and says why in plain words.
- Motion: a card eases into its new column in `--duration-base`; none under `prefers-reduced-motion`.
- **Today strip:** a "Where the work is" band: six small column tiles with counts and a segmented flow bar,
  a "Stuck" tile (in progress or started for more than 7 days, or in review for more than 3 days), a
  "Needs you" tile (ideas to decide, pull requests waiting, anything on the owner), and a "Moved today"
  line. Each tile links into the board filtered to that group.
- Light and dark, every new component on `/design`, accessible names, visible focus, full keyboard path.

## 5. The agent as boss

- `pnpm actions move <id> <column> --from <column> --note "…"` (actor `claude`, note required) and
  `pnpm actions list --column <column>`. `set`, `link` and `add` keep working; `add` accepts
  `--column`.
- AGENTS.md gets a short rule: the main agent keeps each card's column true (a pull request opened moves
  its card to In review, a merge to Done) and records disagreements it cannot resolve on the card.

## 6. Reliability

- Board query is bounded (existing 200-card cap, Done limited to 14 days).
- Concurrent moves: the stale check (`from` column must match) rejects the second mover with a plain
  message; the UI refreshes.
- The API accepts only the six column names; the body is validated with zod at the boundary.

## 7. Decisions

- A new `stage` column, not new status values, so the 17 places that depend on status keep working.
- Native drag events, not a library. The menu covers touch and keyboard.
- Cards are not hand-ordered in this version (no rank column); revisit if the owner asks.

## 8. As built

Where the build differs from, or adds to, the sections above.

**Data and moves**
- `actions.stage` (`queue`, `started`, `in_review`, null) and `fromStage` / `toStage` on every
  history event. `boardColumn(row)` in `lib/actions/board-column.ts` is the only place that maps
  status, stage and pull request to a column. A status of done, suggested, snoozed or dismissed
  wins over a stage; a stage only decides for open and in-progress cards. Open with no stage is
  Backlog; in-progress with no stage is In progress, or In review when it has a pull request.
- `moveToColumn(db, { id, from, to, actor, note?, now?, login, productIds })`: two arguments
  beyond the plan, `login` (for the audit entry, as `applyStatusChange` does) and `productIds`
  (a card of an unconfigured product is `not_found`, as for every other action write). It does
  not call `applyStatusChange`: any column may go to any other, so the old allowed-moves table
  does not apply. Refusals, in order: `note_required` (Claude with a blank note), `not_found`,
  `stale`, `same_column`, `has_pull_request` (to In progress with a pull request link),
  `not_allowed` (a new idea straight to Done). A parked card is always stale. A new idea moved to
  Backlog is accepted as open. Every move updates `statusChangedAt`, including a stage-only move.
- A stage-only move (Backlog to Queue) counts as a status change for "who is on it" and for the
  active-work query; adding a pull request link (status and stage unchanged) does not.
- Linking a pull request to a card In progress (no stage) moves it to In review: `linkPullRequest`
  sets stage `in_review`, restarts `statusChangedAt`, and its history entry records the stage
  change, so the card is not Stuck at once and the link counts as Claude's move. Clearing a link
  that alone made an older card In review restarts `statusChangedAt` too. A link that does not
  change the column leaves both alone.
- API: `POST /api/actions/<id>` accepts the old status body unchanged or a strict
  `{ moveFrom, moveTo, note? }`; a mixed body is 400. Success is `{ id, column }`, a refusal is
  409 `{ error, message }` with the plain sentence; `not_found` is 404 with its sentence too.
- CLI: `move`, `list --column`, `add --column` (any column but done), `show` prints the column.
  `--status` with `--column` is refused. `list --column` uses a SQL mirror of `boardColumn`
  (`board-column-sql.ts`), checked against it for every status, stage and pull request case.

**Board data (`loadBoard`)**
- `loadBoard(db, filter, now, products)` returns the six columns, the parked list and true column
  `counts` (SQL totals that ignore the 200-card cap and the `focus` narrowing). Cards of
  unconfigured products are skipped.
- Done shows the last 14 days (`DONE_DAYS`; exactly 14 days is kept). Parked is every snoozed
  card plus dismissed cards from the last 14 days; the 200-card cap fills the columns first and
  parked gets the remainder; `truncated` says either was cut.
- Stuck: whole days since `statusChangedAt` strictly greater than the limit (7 days 23 hours is
  not stuck), only in Started, In progress (7 days) and In review (3 days), from `STUCK_DAYS`,
  which also words the copy so the two cannot drift.
- `needsOwner` is true for a new idea, a card with a pull request waiting for a look, any card In
  review (with no pull request it reads "Waiting for you to look it over", whoever moved it
  there), or a card in Started or In progress that waits on the owner. Backlog and Queue cards that merely
  read "waiting for you" do not count: they would flag every card.
- `STATUS_COLUMN` stayed: the list view, history and /design still use it.

**Screens**
- `/actions` defaults to the board; `?view=list` is the old list (its Status filter stays there,
  and the board hides it because the columns are the statuses). `?focus=stuck|needs-you` narrows
  the board and shows "Showing only ..." with **Show everything**; while focused, each column
  counts the cards it shows and the Parked strip is left out.
- Moves use native HTML5 drag (pointer only) and the **Move to...** menu button (keyboard and
  touch). A move is optimistic: the card goes to the top of its new column, a refusal puts it back
  and shows the server's sentence, and either way the board refreshes and focus lands on the
  card's heading. The announcement is "Moved <title> to <Column>". In demo mode (/design) nothing
  is sent.
- A card shows its stored status, card number and column id only under Technical details.

**Today strip**
- Tiles link to `/actions?view=board#column-<id>`, a jump to the column rather than a filter.
  **See the stuck jobs** and **See what needs you** link to `&focus=stuck` and `&focus=needs-you`.
- Counts per column, and the stuck and needs-you counts, are true totals from SQL
  (`board-focus-sql.ts` mirrors the stuck and needs-you rules, checked against the cards in
  `board-focus.test.ts`). The first five needs-you lines come from a board focused on needs-you,
  whose query (and so its 200-card cap) holds only those cards; `?focus=` narrows the same way.
- "Moved today" counts cards with a status or stage change since local midnight in
  `HARBOUR_TIMEZONE`; creation and pull request links are not moves, except a link that moves a
  card from In progress to In review.
- The strip sits after the Today header and sample banner, not directly under the note.

**Agent as boss**
- The main agent keeps each card's column true (AGENTS.md): a pull request opened moves the card
  to In review, a merge moves it to Done, and what it cannot resolve is written on the card.

**Tests**
- `tests/e2e/board.spec.ts` (project `board`, last in order) seeds Fern & Field cards through
  production code (`tests/e2e/seed-board.ts`) and checks six columns with counts, a keyboard move
  with its announcement and focus, a drag move, a refused move (a card with a pull request moved
  to In progress) reverting with its sentence, and the Today strip links with **Show everything**.
