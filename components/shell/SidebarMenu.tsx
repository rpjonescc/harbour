"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

const MENU_ID = "site-menu";

/**
 * The sidebar's frame. From the md breakpoint up it is the left rail, always open. Below it, the
 * sidebar is a compact top bar (brand and a Menu button) and the menu opens in place under it:
 * focus moves to its first link, Escape closes it and returns focus to the button, and going to
 * another page closes it.
 */
export function SidebarMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Close on navigation (React's "adjust state while rendering" pattern, no effect needed).
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);
  if (pathname !== shownFor) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="flex flex-col md:flex-1">
      <div className="flex items-center justify-between gap-2 px-2 md:pb-4 md:pt-1">
        <p className="font-serif text-xl">Harbour</p>
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls={MENU_ID}
          onClick={() => setOpen((was) => !was)}
          className="rounded-sm border border-line bg-surface px-3 py-1.5 text-sm text-ink md:hidden"
        >
          Menu
        </button>
      </div>
      <div
        id={MENU_ID}
        ref={panel}
        className={`${open ? "flex" : "hidden"} mt-3 flex-col md:mt-0 md:flex md:flex-1`}
      >
        {children}
      </div>
    </div>
  );
}
