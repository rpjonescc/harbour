import "server-only";
import { type FSWatcher, watch } from "node:fs";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { checkBrainRoot } from "./docs";
import { reindexAll } from "./indexer";
import { createSingleFlight } from "./single-flight";
import { newDocPaths } from "./views";
import { isIgnoredChange } from "./watch-filter";

export type BrainStatus =
  | { available: true; root: string; watchError: string | null; indexError: string | null }
  | { available: false; root: string; reason: "missing" | "not-directory" | "unreadable" };

export type Runtime = {
  watcher: FSWatcher | null;
  /** The file watcher failed; only a restart brings live updates back. */
  watchError: string | null;
  /** The last index run failed; cleared by the next successful run. */
  indexError: string | null;
  reindex: () => boolean;
};

const WATCH_DEBOUNCE_MS = 1000;
let runtime: Runtime | undefined;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Starts the index and watcher, retaining errors so the viewer can offer recovery. */
export function createBrainRuntime(root: string, index: () => void): Runtime {
  const state: Runtime = {
    watcher: null,
    watchError: null,
    indexError: null,
    reindex: () => false,
  };
  const indexFailed = (error: unknown) => {
    console.error("brain reindex failed", error);
    state.indexError = `Reindex failed: ${message(error)}`;
  };
  const watchFailed = (prefix: string, error: unknown) => {
    console.error("brain file watcher failed", error);
    state.watchError = `${prefix}: ${message(error)}`;
  };
  try {
    index(); // synchronous first pass so the first page has data
  } catch (error) {
    indexFailed(error);
  }
  const runner = createSingleFlight(
    () => {
      index();
    },
    indexFailed,
    () => {
      state.indexError = null;
    },
  );
  state.reindex = () => runner.trigger(0);
  try {
    state.watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!isIgnoredChange(filename)) runner.trigger(WATCH_DEBOUNCE_MS);
    });
    state.watcher.on("error", (error) => watchFailed("File watcher stopped", error));
  } catch (error) {
    watchFailed("File watcher unavailable", error);
  }
  return state;
}

function start(root: string): Runtime {
  const db = getDb();
  return createBrainRuntime(root, () => reindexAll(db, root));
}

/** Brain availability; indexes and starts watching on first successful call. */
export function ensureBrain(): BrainStatus {
  const root = getConfig().HARBOUR_BRAIN_DIR;
  const status = checkBrainRoot(root);
  if (!status.ok) return { available: false, root, reason: status.reason };
  runtime ??= start(root);
  return {
    available: true,
    root,
    watchError: runtime.watchError,
    indexError: runtime.indexError,
  };
}

/** Starts a reindex now; false if one is already queued or running. */
export function requestReindex(): boolean {
  return runtime ? runtime.reindex() : false;
}

/**
 * Count for the sidebar badge, or null if the brain is unavailable or failed to index.
 * The failure itself is shown on /brain, so the badge just hides.
 */
export function brainNewCount(): number | null {
  try {
    return ensureBrain().available ? newDocPaths(getDb()).size : null;
  } catch (error) {
    console.error("brain index unavailable", error);
    return null;
  }
}
