import { makeThrottle } from "./throttle";

describe("makeThrottle", () => {
  it("opens on the first call, then at most once per interval", () => {
    const due = makeThrottle(30_000);
    expect([0, 29_999, 30_000, 45_000, 60_000].map(due)).toEqual([true, false, true, false, true]);
  });

  it("opens at once when the clock steps backwards", () => {
    const due = makeThrottle(30_000);
    expect(due(100_000)).toBe(true);
    expect(due(10_000)).toBe(true);
    expect(due(20_000)).toBe(false);
  });
});
