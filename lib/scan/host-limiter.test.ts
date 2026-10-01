import { HostLimiter } from "./host-limiter";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("HostLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never runs more than `concurrency` tasks per host at once", async () => {
    const limiter = new HostLimiter({ concurrency: 2, spacingMs: 0 });
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(20);
      active--;
    };
    const all = Promise.all(
      Array.from({ length: 5 }, () => limiter.run("example.com", undefined, task)),
    );
    await vi.runAllTimersAsync();
    await all;
    expect(peak).toBe(2);
  });

  it("spaces task starts on one host but not across hosts", async () => {
    const limiter = new HostLimiter({ concurrency: 2, spacingMs: 500 });
    const starts: string[] = [];
    const record = (label: string) => async () => {
      starts.push(`${label}@${Date.now() - t0}`);
    };
    const t0 = Date.now();
    const all = Promise.all([
      limiter.run("a.example.com", undefined, record("a1")),
      limiter.run("a.example.com", undefined, record("a2")),
      limiter.run("a.example.com", undefined, record("a3")),
      limiter.run("b.example.com", undefined, record("b1")),
    ]);
    await vi.runAllTimersAsync();
    await all;
    expect(starts).toEqual(["a1@0", "b1@0", "a2@500", "a3@1000"]);
  });

  it("rejects a queued task on abort without running it or leaking its slot", async () => {
    const limiter = new HostLimiter({ concurrency: 1, spacingMs: 0 });
    let release = () => {};
    const holding = limiter.run(
      "example.com",
      undefined,
      () => new Promise<void>((r) => (release = r)),
    );
    const controller = new AbortController();
    const ran = vi.fn();
    const queued = limiter.run("example.com", controller.signal, async () => ran());
    controller.abort(new Error("cancelled"));
    await expect(queued).rejects.toThrow("cancelled");
    release();
    await holding;
    await limiter.run("example.com", undefined, async () => {});
    expect(ran).not.toHaveBeenCalled();
  });

  it("rejects an aborted task during its spacing wait without running it", async () => {
    const limiter = new HostLimiter({ concurrency: 2, spacingMs: 200 });
    await limiter.run("example.com", undefined, async () => {});
    const controller = new AbortController();
    const ran = vi.fn();
    const waiting = limiter.run("example.com", controller.signal, async () => ran());
    controller.abort(new Error("cancelled"));
    await expect(waiting).rejects.toThrow("cancelled");
    expect(ran).not.toHaveBeenCalled();
  });

  it("refuses to start when the signal is already aborted", async () => {
    const limiter = new HostLimiter({ concurrency: 2, spacingMs: 0 });
    const ran = vi.fn();
    await expect(
      limiter.run("example.com", AbortSignal.abort(new Error("gone")), ran),
    ).rejects.toThrow("gone");
    expect(ran).not.toHaveBeenCalled();
  });

  it("frees the slot when a task throws", async () => {
    const limiter = new HostLimiter({ concurrency: 1, spacingMs: 0 });
    await expect(
      limiter.run("example.com", undefined, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(limiter.run("example.com", undefined, async () => "ok")).resolves.toBe("ok");
  });
});
