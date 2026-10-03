"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";

/** True while the owner is typing somewhere, where `?` is a character and not a shortcut. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  // Read the attribute as well as isContentEditable, which not every DOM implements.
  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

/** A page showing more than one (the /design examples) answers `?` with its header's only. */
function firstOnPage(button: HTMLButtonElement | null): boolean {
  return button !== null && document.querySelector('[aria-keyshortcuts="?"]') === button;
}

type Refs = {
  root: RefObject<HTMLElement | null>;
  button: RefObject<HTMLButtonElement | null>;
  panel: RefObject<HTMLElement | null>;
};

/** Open state for "What's this page?": `?` opens, Escape closes, a click outside closes. */
export function usePageHelp({ root, button, panel }: Refs) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((was) => !was), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        button.current?.focus();
        return;
      }
      if (event.key !== "?" || open || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typing(event.target) || !firstOnPage(button.current)) return;
      event.preventDefault();
      setOpen(true);
      // Move focus to the panel, so a screen reader reads it and Tab continues inside it.
      requestAnimationFrame(() => panel.current?.focus());
    };
    const onPointer = (event: PointerEvent) => {
      if (open && !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, root, button, panel]);

  return { open, toggle };
}
