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

Filled in when the work is merged.
