import { HostLimiter } from "./host-limiter";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("HostLimiter", () => {
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
    await Promise.all(Array.from({ length: 5 }, () => limiter.run("example.com", undefined, task)));
    expect(peak).toBe(2);
  });

  it("spaces task starts on one host but not across hosts", async () => {
    const limiter = new HostLimiter({ concurrency: 2, spacingMs: 100 });
    const starts = { a: [] as number[], b: [] as number[] };
    const record = (host: "a" | "b") => async () => {
      starts[host].push(performance.now());
    };
    await Promise.all([
      limiter.run("a.example.com", undefined, record("a")),
      limiter.run("a.example.com", undefined, record("a")),
      limiter.run("a.example.com", undefined, record("a")),
      limiter.run("b.example.com", undefined, record("b")),
    ]);
    const [first = 0, second = 0, third = 0] = starts.a;
    const [other = Number.POSITIVE_INFINITY] = starts.b;
    expect(starts.a).toHaveLength(3);
    expect(second - first).toBeGreaterThanOrEqual(95);
    expect(third - second).toBeGreaterThanOrEqual(95);
    expect(other - first).toBeLessThan(80);
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
