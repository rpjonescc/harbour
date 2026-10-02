import { isStalled, joinSavingPoll, STILL_WAITING, subscribeStalled } from "./savingPoller";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the shared saving poller", () => {
  it("refreshes once per tick however many pieces are saving, and slows down to 15 seconds", () => {
    const refresh = vi.fn();
    const leaves = [joinSavingPoll(refresh), joinSavingPoll(refresh), joinSavingPoll(refresh)];
    vi.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000); // the next wait is 3 s
    expect(refresh).toHaveBeenCalledTimes(2);
    refresh.mockClear();
    vi.advanceTimersByTime(60_000);
    // Backed off: at most one refresh per 15 s once it has slowed down.
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(6);
    for (const leave of leaves) leave();
  });

  it("stops when the last one leaves, and starts again from 2 seconds", () => {
    const refresh = vi.fn();
    const leave = joinSavingPoll(refresh);
    vi.advanceTimersByTime(10_000);
    leave();
    refresh.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(refresh).not.toHaveBeenCalled();
    const again = joinSavingPoll(refresh);
    vi.advanceTimersByTime(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    again();
  });

  it("gives up after a bound, says so, and stops polling", () => {
    const refresh = vi.fn();
    const heard = vi.fn();
    const unsubscribe = subscribeStalled(heard);
    const leave = joinSavingPoll(refresh);
    vi.advanceTimersByTime(4 * 60_000);
    expect(isStalled()).toBe(true);
    expect(heard).toHaveBeenCalled();
    const calls = refresh.mock.calls.length;
    vi.advanceTimersByTime(5 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(calls);
    expect(STILL_WAITING).toMatch(/Still saving/);
    leave();
    expect(isStalled()).toBe(false);
    unsubscribe();
  });
});
