import { describeError } from "@/lib/jobs/settle-job";

/** A tile's data, or why it could not be read (the error, for the tile's Technical details). */
export type TileResult<T> = { ok: true; data: T } | { ok: false; detail: string };

/**
 * Runs one tile's reader so a throw breaks only that tile: the error is logged with the tile's
 * name and returned as a failure, never turned into an empty success.
 */
export function loadTile<T>(name: string, read: () => T): TileResult<T> {
  try {
    return { ok: true, data: read() };
  } catch (error) {
    const detail = describeError(error);
    console.error(`tower tile "${name}" failed: ${detail}`);
    return { ok: false, detail };
  }
}
