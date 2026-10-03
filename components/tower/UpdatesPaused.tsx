"use client";

import { UPDATES_PAUSED } from "@/lib/explain/tower";
import { HEADER_TEXT } from "@/lib/explain/tower-tiles";
import { TILE_LINK } from "./link-styles";

/** Said once the tower stops refreshing itself: why, and a Reload button to start again. */
export function UpdatesPaused() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
      {UPDATES_PAUSED}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={`${TILE_LINK} min-h-11 cursor-pointer`}
      >
        {HEADER_TEXT.reload}
      </button>
    </p>
  );
}
