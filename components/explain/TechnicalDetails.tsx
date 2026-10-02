"use client";

import { type ReactNode, useEffect, useState } from "react";

const KEY_PREFIX = "harbour:technical-details:";

function readChoice(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "open";
  } catch {
    // Storage can be blocked (private mode, policy); the section then starts closed, as always.
    return false;
  }
}

function saveChoice(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // Remembering is only a convenience: without storage the section still opens and closes.
  }
}

type Props = {
  /** Stable per section: the owner's open/closed choice is remembered under it. */
  id: string;
  /** What is inside, e.g. "scores in numbers": names the summary for screen readers. */
  topic: string;
  children: ReactNode;
};

/** Raw evidence, codes and formulas: closed by default, remembering the owner's choice. */
export function TechnicalDetails({ id, topic, children }: Props) {
  const key = `${KEY_PREFIX}${id}`;
  const [open, setOpen] = useState(false);
  // After mount only: the server render (and a first visit) is always closed.
  useEffect(() => {
    if (readChoice(key)) setOpen(true);
  }, [key]);
  return (
    <details
      open={open}
      onToggle={(event) => {
        const now = event.currentTarget.open;
        setOpen(now);
        saveChoice(key, now);
      }}
      className="text-xs"
    >
      <summary className="w-fit cursor-pointer rounded-sm text-ink-muted hover:text-ink">
        Technical details <span className="sr-only">({topic})</span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
