"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { type ChangeSnapshot, focusCandidates, focusFirst } from "./focus-after-change";

export type BoardAnnouncer = {
  announce: (text: string) => void;
  alert: (text: string) => void;
  /** Refreshes the board in a transition, then moves focus to the nearest surviving heading. */
  afterChange: (snapshot: ChangeSnapshot, refresh: () => void) => void;
};

const AnnounceContext = createContext<BoardAnnouncer | null>(null);

/**
 * The board's live regions and focus keeper. A status change can move a card out of the
 * current filter on refresh; announcing and alerting here keeps the message when the card is
 * gone, and focus lands on the nearest heading instead of the page body.
 */
export function ActionAnnouncer({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [settled, setSettled] = useState(0);
  const [, startTransition] = useTransition();
  const pending = useRef<ChangeSnapshot | null>(null);

  useEffect(() => {
    const snapshot = pending.current;
    if (settled === 0 || !snapshot) return;
    pending.current = null;
    focusFirst(focusCandidates(snapshot));
  }, [settled]);

  const afterChange = useCallback((snapshot: ChangeSnapshot, refresh: () => void) => {
    pending.current = snapshot;
    // The settle counter commits with the refreshed tree, so the effect sees the new board.
    startTransition(() => {
      refresh();
      setSettled((n) => n + 1);
    });
  }, []);

  const board = useMemo(() => ({ announce: setText, alert: setError, afterChange }), [afterChange]);
  return (
    <AnnounceContext value={board}>
      <p role="status" className="sr-only">
        {text}
      </p>
      <p role="alert" className="text-sm text-bad empty:hidden">
        {error}
      </p>
      {children}
    </AnnounceContext>
  );
}

/** The board's announcer, or null outside one (the caller then shows its own regions). */
export function useBoardAnnouncer(): BoardAnnouncer | null {
  return useContext(AnnounceContext);
}
