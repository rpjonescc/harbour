"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";

/** Back after longer than this hidden, the page refreshes at once rather than at the next tick. */
export const STALE_AFTER_HIDDEN_MS = 60_000;

const isVisible = () => document.visibilityState === "visible";

/**
 * Re-reads the page's server data every `everyMs` while the tab is visible, never while hidden,
 * once at once on return after a minute away, and stops for good after `max` refreshes (then
 * calls `onPaused`). One interval at a time, cleared on unmount; the count survives a change of
 * pace, so switching between 60 s and 15 s never resets the cap.
 */
export function useVisibleRefresh({
  everyMs,
  max,
  onPaused,
}: {
  everyMs: number;
  max: number;
  onPaused: () => void;
}): void {
  const router = useRouter();
  const count = useRef(0);
  const paused = useEffectEvent(onPaused);

  useEffect(() => {
    if (count.current >= max) return;
    let hiddenAt: number | null = isVisible() ? null : Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const refresh = () => {
      count.current += 1;
      router.refresh();
      if (count.current >= max) {
        stop();
        paused();
      }
    };
    function onVisibility() {
      if (!isVisible()) {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away > STALE_AFTER_HIDDEN_MS) refresh();
    }
    timer = setInterval(() => {
      if (isVisible()) refresh();
    }, everyMs);
    document.addEventListener("visibilitychange", onVisibility);
    return stop;
  }, [everyMs, max, router]);
}
