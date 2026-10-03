"use client";

import { useState } from "react";
import { UpdatesPaused } from "./UpdatesPaused";
import { useVisibleRefresh } from "./useVisibleRefresh";

/** Every minute while the tab is visible; every 15 s while a check or agent run is going. */
export const REFRESH_EVERY_MS = 60_000;
export const REFRESH_ACTIVE_MS = 15_000;
/** About two hours at a minute each: then it stops, so a forgotten tab never polls for ever. */
export const MAX_REFRESHES = 120;

/**
 * Keeps the tower current in place (open tips and panels stay open). Renders nothing until it
 * stops after its cap, then says so with a Reload button.
 */
export function VisibleRefresh({ active }: { active: boolean }) {
  const [paused, setPaused] = useState(false);
  useVisibleRefresh({
    everyMs: active ? REFRESH_ACTIVE_MS : REFRESH_EVERY_MS,
    max: MAX_REFRESHES,
    onPaused: () => setPaused(true),
  });
  return paused ? <UpdatesPaused /> : null;
}
