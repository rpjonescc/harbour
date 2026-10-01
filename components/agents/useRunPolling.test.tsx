// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { RunEvent, RunJob } from "./run-types";
import { useRunPolling } from "./useRunPolling";

const job = (status: RunJob["status"]): RunJob => ({
  id: 7,
  kind: "research",
  status,
  error: null,
  label: "Research: Glossary",
  createdAt: "2026-10-01T00:00:00.000Z",
  startedAt: "2026-10-01T00:00:01.000Z",
  finishedAt: status === "running" ? null : "2026-10-01T00:01:00.000Z",
});
const event = (id: number): RunEvent => ({
  id,
  at: "2026-10-01T00:00:02.000Z",
  kind: "status",
  text: `step ${id}`,
});

const fetchMock = vi.fn();
const respond = (status: RunJob["status"], events: RunEvent[]) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ job: job(status), events }), { status: 200 }),
  );
const tick = () => act(() => vi.advanceTimersByTimeAsync(2000));

describe("useRunPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("asks for events after the last one and de-duplicates repeats", async () => {
    respond("running", [event(1), event(2)]);
    const { result } = renderHook(() => useRunPolling(job("running"), [event(1)]));
    await tick();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/agents/7?after=1");
    expect(result.current.events.map((e) => e.id)).toEqual([1, 2]);
    respond("running", [event(3)]);
    await tick();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/agents/7?after=2");
    expect(result.current.events.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("stops polling once the run has finished", async () => {
    respond("ok", [event(1)]);
    const { result } = renderHook(() => useRunPolling(job("running"), []));
    await tick();
    expect(result.current.job.status).toBe("ok");
    await tick();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never polls a finished run", async () => {
    renderHook(() => useRunPolling(job("failed"), []));
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops polling on unmount", async () => {
    const { unmount } = renderHook(() => useRunPolling(job("running"), []));
    unmount();
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a lost connection and keeps polling", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useRunPolling(job("running"), []));
    await tick();
    expect(result.current.lostConnection).toBe(true);
    respond("running", []);
    await tick();
    expect(result.current.lostConnection).toBe(false);
  });
});
