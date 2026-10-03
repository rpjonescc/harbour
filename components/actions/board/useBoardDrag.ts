"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";
import type { BoardColumnId } from "@/lib/actions/board-column";

const DRAG_TYPE = "text/plain";

/** Props a draggable card spreads onto its root element. */
export type CardDragProps = {
  draggable: true;
  /** Set on the card being dragged (its look, and what the e2e waits for). */
  "data-dragging"?: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

/** Props a column spreads onto its drop zone. */
export type ZoneDragProps = {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

/**
 * Mouse drag and drop between columns with native HTML5 drag events (no library). The Move to…
 * menu is the keyboard and touch path, so this only needs to serve a pointer. Only a drag this
 * board started is accepted. `columns` is the board's cards: when they refresh, the dragged card
 * may have unmounted and its dragend will never come, so the drag is forgotten.
 */
export function useBoardDrag(
  onDrop: (cardId: number, to: BoardColumnId) => void,
  columns: unknown,
) {
  // A ref, set synchronously in dragstart: a quick flick sends dragover and drop before React
  // re-renders, and those must already see the card. The state is only for the card's look.
  const draggedRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<BoardColumnId | null>(null);

  const end = () => {
    draggedRef.current = null;
    setDragging(null);
    setOver(null);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new `columns` is the trigger.
  useEffect(end, [columns]);

  const card = (id: number): CardDragProps => ({
    draggable: true,
    "data-dragging": dragging === id ? true : undefined,
    onDragStart: (event) => {
      // Firefox starts a drag only when some data is set.
      event.dataTransfer?.setData(DRAG_TYPE, String(id));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      draggedRef.current = id;
      setDragging(id);
    },
    onDragEnd: end,
  });

  const zone = (column: BoardColumnId): ZoneDragProps => ({
    onDragOver: (event) => {
      if (draggedRef.current === null) return;
      // Cancelling dragover is what makes this element a drop target.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setOver(column);
    },
    onDragLeave: (event) => {
      // Moving over a card inside the column fires a leave too; only leaving the column counts.
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setOver((was) => (was === column ? null : was));
    },
    onDrop: (event) => {
      const id = draggedRef.current;
      if (id === null) return;
      event.preventDefault();
      end();
      onDrop(id, column);
    },
  });

  return { dragging, over, card, zone };
}
