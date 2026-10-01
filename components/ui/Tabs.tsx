"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";

export type TabItem = { id: string; label: string; panel: ReactNode };

/** Where a key moves the selection among `count` tabs; null for keys tabs ignore. */
function target(key: string, current: number, count: number): number | null {
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * Accessible tabs without a library: one tab in the tab order (roving tabindex), arrow keys
 * (wrapping), Home and End, and selection that follows focus.
 */
export function Tabs({ label, tabs }: { label: string; tabs: TabItem[] }) {
  const prefix = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = target(event.key, selected, tabs.length);
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${tab.id}`}
            aria-selected={i === selected}
            aria-controls={`${prefix}-panel-${tab.id}`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={onKeyDown}
            className={`-mb-px rounded-t-sm border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              i === selected
                ? "border-accent text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${prefix}-panel-${tab.id}`}
          aria-labelledby={`${prefix}-tab-${tab.id}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a tab panel is focusable so keyboard users reach its content (APG tabs pattern)
          tabIndex={0}
          hidden={i !== selected}
          className="rounded-b-sm pt-4"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
