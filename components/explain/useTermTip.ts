"use client";

import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const HOVER_OPEN_MS = 300;
const HOVER_CLOSE_MS = 150;
/** Room kept between the tip and the viewport edge, in px (the tip's width cap leaves 16 each side). */
const EDGE = 16;

/** Why the tip is open: a pinned tip (click, tap, Enter or Space) ignores hover and focus moves. */
type Mode = "closed" | "hover" | "focus" | "pinned";
export type TipPlacement = { below: boolean; shiftX: number };
const ABOVE: TipPlacement = { below: false, shiftX: 0 };

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Above the word unless there is no room; nudged sideways to stay inside the viewport. */
function usePlacement(open: boolean, tip: RefObject<HTMLElement | null>): TipPlacement {
  const [placement, setPlacement] = useState(ABOVE);
  useLayoutEffect(() => {
    if (!open) return setPlacement(ABOVE);
    const rect = tip.current?.getBoundingClientRect();
    if (!rect) return;
    const overRight = rect.right - (window.innerWidth - EDGE);
    const shiftX = overRight > 0 ? -overRight : Math.max(0, EDGE - rect.left);
    setPlacement({ below: rect.top < EDGE, shiftX });
  }, [open, tip]);
  return placement;
}

/** Open state, hover delays, Escape and outside clicks for one `<Term>`. */
export function useTermTip() {
  const [mode, setMode] = useState<Mode>("closed");
  const open = mode !== "closed";
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const later = (ms: number, next: (was: Mode) => Mode) => {
    clearTimer();
    timer.current = setTimeout(() => setMode(next), ms);
  };
  const close = useCallback(() => {
    clearTimer();
    setMode("closed");
  }, [clearTimer]);
  const toggle = () => {
    clearTimer();
    setMode((was) => (was === "pinned" ? "closed" : "pinned"));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      if (root.current?.contains(document.activeElement)) button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  useEffect(() => clearTimer, [clearTimer]);

  const rootProps = {
    ref: root,
    onMouseEnter: () => later(HOVER_OPEN_MS, (was) => (was === "closed" ? "hover" : was)),
    onMouseLeave: () => later(HOVER_CLOSE_MS, (was) => (was === "hover" ? "closed" : was)),
    onFocus: () => setMode((was) => (was === "pinned" ? was : "focus")),
    onBlur: (event: { relatedTarget: EventTarget | null }) => {
      if (!root.current?.contains(event.relatedTarget as Node | null)) close();
    },
  };
  // Enter and Space are handled on key down (and the native click they would cause is cancelled),
  // so a key press toggles exactly once in every browser.
  const buttonProps = {
    ref: button,
    onClick: toggle,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    },
    onKeyUp: (event: KeyboardEvent) => {
      if (event.key === " ") event.preventDefault();
    },
  };
  const placement = usePlacement(open, tip);
  return { open, rootProps, buttonProps, tip, placement, fade: !usePrefersReducedMotion() };
}
