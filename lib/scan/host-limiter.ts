type HostState = { active: number; nextStart: number; waiters: Array<() => void> };

export type HostLimits = { concurrency: number; spacingMs: number };

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  // An abort that landed before the listener exists must not wait out the whole delay.
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Politeness per host: at most `concurrency` tasks at once and at least `spacingMs` between
 * task starts. Hosts are the few configured product origins and Google API hosts, so the
 * per-host state is kept for the life of the process rather than evicted.
 */
export class HostLimiter {
  private readonly hosts = new Map<string, HostState>();

  constructor(private readonly limits: HostLimits) {}

  /** Runs `task` once a slot and its start time come up; an abort before then rejects with its reason. */
  async run<T>(host: string, signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    signal?.throwIfAborted();
    const state = this.state(host);
    await this.acquire(state, signal);
    try {
      const now = Date.now();
      const wait = state.nextStart - now;
      // Reserve this start time now so concurrent callers queue behind it.
      state.nextStart = Math.max(now, state.nextStart) + this.limits.spacingMs;
      if (wait > 0) await sleep(wait, signal);
      signal?.throwIfAborted();
      return await task();
    } finally {
      this.release(state);
    }
  }

  private state(host: string): HostState {
    let state = this.hosts.get(host);
    if (!state) {
      state = { active: 0, nextStart: 0, waiters: [] };
      this.hosts.set(host, state);
    }
    return state;
  }

  private acquire(state: HostState, signal: AbortSignal | undefined): Promise<void> {
    if (state.active < this.limits.concurrency) {
      state.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        state.waiters.splice(state.waiters.indexOf(wake), 1);
        reject(signal?.reason);
      };
      const wake = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      state.waiters.push(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** Hands the slot straight to the next waiter so a newcomer cannot jump the queue. */
  private release(state: HostState): void {
    const next = state.waiters.shift();
    if (next) next();
    else state.active--;
  }
}
