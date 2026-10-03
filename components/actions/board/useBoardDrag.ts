"use client";

import { type DragEvent, useState } from "react";
import type { BoardColumnId } from "@/lib/actions/board-column";

const DRAG_TYPE = "text/plain";

/** Props a draggable card spreads onto its root element. */
export type CardDragProps = {
  draggable: true;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

/** Props a column spreads onto its drop zone. */
export type ZoneDragProps = {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

/** The card id a drop carries: the one this board started dragging, else the transfer's text. */
function droppedId(dragging: number | null, event: DragEvent<HTMLElement>): number | null {
  if (dragging !== null) return dragging;
  const id = Number(event.dataTransfer?.getData(DRAG_TYPE));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Mouse drag and drop between columns with native HTML5 drag events (no library). The Move to…
 * menu is the keyboard and touch path, so this only needs to serve a pointer.
 */
export function useBoardDrag(onDrop: (cardId: number, to: BoardColumnId) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<BoardColumnId | null>(null);

  const card = (id: number): CardDragProps => ({
    draggable: true,
    onDragStart: (event) => {
      // Firefox starts a drag only when some data is set.
      event.dataTransfer?.setData(DRAG_TYPE, String(id));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      setDragging(id);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  const zone = (column: BoardColumnId): ZoneDragProps => ({
    onDragOver: (event) => {
      if (dragging === null) return;
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
      event.preventDefault();
      const id = droppedId(dragging, event);
      setDragging(null);
      setOver(null);
      if (id !== null) onDrop(id, column);
    },
  });

  return { dragging, over, card, zone };
}
