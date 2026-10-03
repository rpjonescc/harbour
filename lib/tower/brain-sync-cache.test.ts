import type { SyncRead } from "@/lib/agents/brain-status";
import { BRAIN_SYNC_TTL_MS, syncReadCache } from "./brain-sync-cache";

const t0 = new Date("2026-10-04T09:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

function counting(values: SyncRead[]) {
  const read = vi.fn((_root: string) => values[read.mock.calls.length - 1] ?? "failed");
  return read;
}

describe("syncReadCache", () => {
  it("runs git once per 30 s for every render in between", () => {
    const read = counting([
      { unsaved: 1, unpushed: 0 },
      { unsaved: 2, unpushed: 0 },
    ]);
    const cached = syncReadCache(read);
    expect(cached("/brain", t0)).toEqual({ unsaved: 1, unpushed: 0 });
    expect(cached("/brain", at(15_000))).toEqual({ unsaved: 1, unpushed: 0 });
    expect(cached("/brain", at(BRAIN_SYNC_TTL_MS - 1))).toEqual({ unsaved: 1, unpushed: 0 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(cached("/brain", at(BRAIN_SYNC_TTL_MS))).toEqual({ unsaved: 2, unpushed: 0 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps a failure as a failure for the same 30 s, so a slow git is not retried every refresh", () => {
    const read = counting(["failed", { unsaved: 0, unpushed: 0 }]);
    const cached = syncReadCache(read);
    expect(cached("/brain", t0)).toBe("failed");
    expect(cached("/brain", at(10_000))).toBe("failed");
    expect(read).toHaveBeenCalledTimes(1);
    expect(cached("/brain", at(31_000))).toEqual({ unsaved: 0, unpushed: 0 });
  });

  it("reads afresh when the clock went backwards, and keeps brains apart", () => {
    const read = counting([
      { unsaved: 1, unpushed: 0 },
      { unsaved: 3, unpushed: 0 },
      { unsaved: 5, unpushed: 0 },
    ]);
    const cached = syncReadCache(read);
    cached("/brain", t0);
    expect(cached("/brain", at(-1_000))).toEqual({ unsaved: 3, unpushed: 0 });
    expect(cached("/other", at(-1_000))).toEqual({ unsaved: 5, unpushed: 0 });
    expect(read.mock.calls.map(([root]) => root)).toEqual(["/brain", "/brain", "/other"]);
  });

  it("remembers at most four brains", () => {
    const read = vi.fn((): SyncRead => ({ unsaved: 0, unpushed: 0 }));
    const cached = syncReadCache(read);
    for (const root of ["/a", "/b", "/c", "/d", "/e"]) cached(root, t0);
    cached("/a", t0);
    expect(read).toHaveBeenCalledTimes(6);
    cached("/e", t0);
    expect(read).toHaveBeenCalledTimes(6);
  });
});
