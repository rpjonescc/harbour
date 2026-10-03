"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import type { BoardColumnId } from "@/lib/actions/board-column";
import { type ApiResult, postJson } from "@/lib/auth/client-api";
import { SIGN_IN_ENDED } from "@/lib/explain/actions";
import { BOARD_TEXT } from "@/lib/explain/board";
import { useBoardAnnouncer } from "../ActionAnnouncer";
import { snapshotBoard } from "../focus-after-change";
import { type BoardCardView, placeCards, shiftCounts } from "./card-view";

type Columns = Readonly<Record<BoardColumnId, readonly BoardCardView[]>>;
type Moved = Readonly<Record<number, BoardColumnId>>;

/** The plain sentence for a move the server did not make: its own refusal when it gave one. */
export function moveFailure(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.message) return result.message;
  if (result.error === "unauthenticated") return SIGN_IN_ENDED;
  return BOARD_TEXT.moveFailed;
}

function without(moved: Moved, id: number): Moved {
  return Object.fromEntries(Object.entries(moved).filter(([key]) => Number(key) !== id));
}

/**
 * The board's moves: the card goes to its new column at once, the server is asked, and a refusal
 * puts it back with the server's plain sentence. Either way the board then refreshes and focus
 * goes to the card's heading. In demo mode (the /design examples) nothing is sent or moved.
 */
export function useBoardMoves({
  columns,
  counts,
  demo,
}: {
  columns: Columns;
  counts: Readonly<Record<BoardColumnId, number>>;
  demo: boolean;
}) {
  const router = useRouter();
  const board = useBoardAnnouncer();
  const [moved, setMoved] = useState<Moved>({});
  const [arrived, setArrived] = useState<number | null>(null);
  // Cards whose move is still waiting for the server's answer.
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  // Fresh cards from the server are the truth for every answered move. A move still waiting keeps
  // its placement: an earlier move's refresh can land first and would put the card back.
  const [seen, setSeen] = useState(columns);
  if (seen !== columns) {
    setSeen(columns);
    setMoved((was) =>
      Object.fromEntries(Object.entries(was).filter(([id]) => pending.has(Number(id)))),
    );
  }
  if (!board) throw new Error("The board's moves need an ActionAnnouncer around them.");
  const { announce, alert, afterChange } = board;

  // Each card's latest move, resolving to the column it is in once the server has answered.
  const chains = useRef(new Map<number, Promise<BoardColumnId>>());

  /** Asks the server to move the card out of `from`; resolves to the column it is in afterwards. */
  async function send(card: BoardCardView, from: BoardColumnId, to: BoardColumnId) {
    if (from === to) return from;
    const snapshot = snapshotBoard(card.id);
    setMoved((was) => ({ ...was, [card.id]: to }));
    setPending((was) => new Set(was).add(card.id));
    setArrived(card.id);
    const result = await postJson<{ id: number; column: BoardColumnId }>(
      `/api/actions/${card.id}`,
      { moveFrom: from, moveTo: to },
    );
    setPending((was) => {
      const now = new Set(was);
      now.delete(card.id);
      return now;
    });
    if (result.ok) {
      announce(BOARD_TEXT.moved(card.title, to));
    } else {
      setMoved((was) =>
        from === card.column ? without(was, card.id) : { ...was, [card.id]: from },
      );
      setArrived(null);
      alert(moveFailure(result));
    }
    // A refusal may mean the card moved elsewhere already: the refresh shows where it is now.
    afterChange(snapshot, () => router.refresh());
    return result.ok ? to : from;
  }

  async function move(card: BoardCardView, to: BoardColumnId) {
    const shown = moved[card.id] ?? card.column;
    if (shown === null || shown === to) return;
    // Clear first, so a repeat of the same message is announced again.
    announce("");
    alert("");
    if (demo) return announce(DEMO_NOTE);
    // One request per card at a time: a second move waits for the first answer and then names the
    // column the card is really in. Sent together, the second could reach the server first and be
    // refused as stale. The card still shows in its new column at once.
    const before = chains.current.get(card.id);
    if (before) setMoved((was) => ({ ...was, [card.id]: to }));
    const run = before ? before.then((from) => send(card, from, to)) : send(card, shown, to);
    chains.current.set(card.id, run);
    await run;
    if (chains.current.get(card.id) === run) chains.current.delete(card.id);
  }

  /** A drop names the card by id; cards not on this board are ignored. */
  function drop(cardId: number, to: BoardColumnId) {
    const card = Object.values(columns)
      .flat()
      .find((c) => c.id === cardId);
    if (card) void move(card, to);
  }

  return {
    placed: placeCards(columns, moved),
    counts: shiftCounts(counts, columns, moved),
    arrived,
    move,
    drop,
  };
}
