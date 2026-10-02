// One poller for every piece and idea that is waiting for the worker to save a decision, however
// many there are: a single timer refreshes the page, slowing down from 2 s to 15 s, and gives up
// after a bound with a plain "still waiting" line instead of polling forever.

const FIRST_MS = 2_000;
const MAX_MS = 15_000;
const GIVE_UP_MS = 3 * 60_000;

export const STILL_WAITING =
  "Still saving. It is taking longer than usual; reload the page in a minute to check.";

type Refresh = () => void;
const refreshers = new Map<symbol, Refresh>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let delay = FIRST_MS;
let waited = 0;
let gaveUp = false;

const notify = () => {
  for (const listener of listeners) listener();
};

function stop() {
  clearTimeout(timer);
  timer = undefined;
  delay = FIRST_MS;
  waited = 0;
  if (gaveUp) {
    gaveUp = false;
    notify();
  }
}

function tick() {
  timer = undefined;
  if (refreshers.size === 0) return;
  // Any router refreshes the whole page, so one call serves everyone.
  refreshers.values().next().value?.();
  waited += delay;
  if (waited >= GIVE_UP_MS) {
    gaveUp = true;
    notify();
    return;
  }
  delay = Math.min(Math.round(delay * 1.5), MAX_MS);
  timer = setTimeout(tick, delay);
}

/** Starts (or joins) the shared poll; returns the function that leaves it. */
export function joinSavingPoll(refresh: Refresh): () => void {
  const id = Symbol("saving");
  refreshers.set(id, refresh);
  if (timer === undefined && !gaveUp) timer = setTimeout(tick, delay);
  return () => {
    refreshers.delete(id);
    if (refreshers.size === 0) stop();
  };
}

export const subscribeStalled = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const isStalled = (): boolean => gaveUp;
