import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces bursts into one run", async () => {
    const task = vi.fn();
    const runner = createSingleFlight(task, vi.fn());
    runner.trigger(1000);
    runner.trigger(1000);
    runner.trigger(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never overlaps; a trigger during a run schedules exactly one follow-up", async () => {
    let release: () => void = () => {};
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const runner = createSingleFlight(task, vi.fn());
    runner.trigger(0);
    await vi.advanceTimersByTimeAsync(0);
    runner.trigger(0);
    runner.trigger(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("reports whether a trigger started fresh work", async () => {
    const runner = createSingleFlight(vi.fn(), vi.fn());
    expect(runner.trigger(0)).toBe(true);
    expect(runner.trigger(0)).toBe(false);
  });

  it("reports failures and success", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const failing = createSingleFlight(
      () => {
        throw new Error("boom");
      },
      onError,
      onSuccess,
    );
    failing.trigger(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
