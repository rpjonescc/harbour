"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const AnnounceContext = createContext<((text: string) => void) | null>(null);

/**
 * One polite live region for the whole board. A status change can move a card out of the
 * current filter on refresh; announcing here keeps the confirmation when the card is gone.
 */
export function ActionAnnouncer({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  return (
    <AnnounceContext value={setText}>
      <p role="status" className="sr-only">
        {text}
      </p>
      {children}
    </AnnounceContext>
  );
}

/** The board's announcer, or null outside one (the caller then shows its own region). */
export function useBoardAnnouncer(): ((text: string) => void) | null {
  return useContext(AnnounceContext);
}
