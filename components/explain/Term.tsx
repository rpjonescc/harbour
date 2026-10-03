"use client";

import { type ReactNode, useId } from "react";
import { GLOSSARY, type TermId } from "@/lib/explain/glossary";
import { useTermTip } from "./useTermTip";

const TIP =
  "absolute left-0 z-30 block w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-surface px-3 py-2 text-left font-sans text-sm font-normal normal-case tracking-normal text-ink shadow-overlay";

/**
 * A word with its meaning one hover, focus, tap or key press away. The tip only explains the word:
 * it never holds a fact the page needs, and every meaning is also listed in "What's this page?".
 */
export function Term({ id, children }: { id: TermId; children: ReactNode }) {
  const entry = GLOSSARY[id];
  const tipId = useId();
  const { open, rootProps, buttonProps, tip, placement, fade } = useTermTip();
  const side = placement.below ? "top-full mt-1" : "bottom-full mb-1";
  return (
    <span {...rootProps} className="relative inline">
      <button
        {...buttonProps}
        type="button"
        aria-describedby={tipId}
        // The ::before box widens the hit area to 44 px tall without moving any text.
        className="relative cursor-help rounded-sm text-left underline decoration-ink-muted decoration-dotted underline-offset-4 before:absolute before:-inset-y-3 before:inset-x-0 before:content-['']"
      >
        {children}
      </button>
      <span
        ref={tip}
        id={tipId}
        role="tooltip"
        hidden={!open}
        style={placement.shiftX ? { translate: `${placement.shiftX}px 0` } : undefined}
        className={`${TIP} ${side}${fade ? " term-tip-fade" : ""}`}
      >
        <span className="block">{entry.meaning}</span>
        {entry.more && (
          <a
            href={entry.more.href}
            className="mt-1 block w-fit rounded-sm text-accent underline underline-offset-2"
          >
            {entry.more.label}
          </a>
        )}
      </span>
    </span>
  );
}
