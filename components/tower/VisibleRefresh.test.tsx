// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { UPDATES_PAUSED } from "@/lib/explain/tower";
import { VisibleRefresh } from "./VisibleRefresh";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

let visibility: DocumentVisibilityState = "visible";

/** Sets the tab's visibility and tells the page, as the browser does. */
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("VisibleRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    nav.refresh.mockReset();
  });

  it("refreshes every 60 s while the tab is visible", () => {
    render(<VisibleRefresh active={false} />);
    advance(59_000);
    expect(nav.refresh).not.toHaveBeenCalled();
    advance(1_000);
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    advance(120_000);
    expect(nav.refresh).toHaveBeenCalledTimes(3);
  });

  it("refreshes every 15 s while a check or agent run is going", () => {
    render(<VisibleRefresh active />);
    advance(60_000);
    expect(nav.refresh).toHaveBeenCalledTimes(4);
  });

  it("never refreshes while the tab is hidden, even when it loaded hidden", () => {
    visibility = "hidden";
    render(<VisibleRefresh active />);
    advance(10 * 60_000);
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("refreshes once at once on return after more than a minute away", () => {
    render(<VisibleRefresh active={false} />);
    advance(30_000);
    setVisibility("hidden");
    advance(61_000);
    expect(nav.refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("waits for the next tick on return after a short time away", () => {
    render(<VisibleRefresh active={false} />);
    setVisibility("hidden");
    advance(20_000);
    setVisibility("visible");
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("stops after 120 refreshes and offers a Reload button", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    render(<VisibleRefresh active={false} />);
    expect(screen.queryByText(UPDATES_PAUSED)).toBeNull();
    advance(120 * 60_000);
    expect(nav.refresh).toHaveBeenCalledTimes(120);
    expect(screen.getByText(UPDATES_PAUSED)).toBeVisible();
    advance(60 * 60_000);
    setVisibility("hidden");
    advance(2 * 60_000);
    setVisibility("visible");
    expect(nav.refresh).toHaveBeenCalledTimes(120);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps one timer, keeps the count across a change of pace and clears on unmount", () => {
    const { rerender, unmount } = render(<VisibleRefresh active={false} />);
    advance(60_000);
    rerender(<VisibleRefresh active />);
    expect(vi.getTimerCount()).toBe(1);
    advance(15_000);
    expect(nav.refresh).toHaveBeenCalledTimes(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(5 * 60_000);
    expect(nav.refresh).toHaveBeenCalledTimes(2);
  });
});
