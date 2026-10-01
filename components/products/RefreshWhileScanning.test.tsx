// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { RefreshWhileScanning } from "./RefreshWhileScanning";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

describe("RefreshWhileScanning", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("does nothing while no scan is active", () => {
    render(<RefreshWhileScanning active={false} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("refreshes every 10 s while a scan is active, and stops when it ends", () => {
    const { rerender } = render(<RefreshWhileScanning active />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(nav.refresh).toHaveBeenCalledTimes(3);
    rerender(<RefreshWhileScanning active={false} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(nav.refresh).toHaveBeenCalledTimes(3);
  });

  it("gives up after an hour so a stuck scan never polls forever", () => {
    render(<RefreshWhileScanning active />);
    act(() => vi.advanceTimersByTime(2 * 60 * 60_000));
    expect(nav.refresh).toHaveBeenCalledTimes(360);
  });
});
