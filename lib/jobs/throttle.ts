/**
 * A gate for the worker's periodic checks: open on the first call, then at most once every
 * `everyMs`. A clock stepped backwards opens it at once, instead of holding off every check
 * until the clock catches up.
 */
export function makeThrottle(everyMs: number): (nowMs: number) => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return (nowMs) => {
    if (nowMs < last) last = Number.NEGATIVE_INFINITY;
    if (nowMs - last < everyMs) return false;
    last = nowMs;
    return true;
  };
}
