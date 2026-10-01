/**
 * Debounced runner that never overlaps itself: triggers during a run schedule exactly one
 * follow-up run. `trigger` returns true when no run was pending or in progress.
 */
export function createSingleFlight(
  task: () => void | Promise<void>,
  onError: (error: unknown) => void,
  onSuccess?: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;

  function schedule(delayMs: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
  }

  async function run() {
    timer = null;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await task();
      onSuccess?.();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule(0);
      }
    }
  }

  return {
    trigger(delayMs: number): boolean {
      const idle = !running && timer === null;
      schedule(delayMs);
      return idle;
    },
  };
}
