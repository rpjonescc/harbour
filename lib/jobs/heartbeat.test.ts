import { keepAlive } from "./heartbeat";

describe("keepAlive", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs a failed heartbeat and keeps beating until stopped", () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const beat = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("database is locked");
      })
      .mockImplementation(() => {});
    const stop = keepAlive(7, beat, 1000);
    vi.advanceTimersByTime(3000);
    expect(beat).toHaveBeenCalledTimes(3);
    expect(errors).toHaveBeenCalledWith("job 7: heartbeat failed", expect.any(Error));
    stop();
    vi.advanceTimersByTime(3000);
    expect(beat).toHaveBeenCalledTimes(3);
  });
});
