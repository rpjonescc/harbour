// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DEMO_NOTE } from "@/components/ui/demo-note";
import type { LatestRun } from "@/lib/note/view";
import { type ExampleButtonState, FreshNoteButton } from "./FreshNoteButton";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), fresh: false }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
// `fresh` makes every render see a new router object, as a re-rendering parent might.
vi.mock("next/navigation", () => ({
  useRouter: () => (nav.fresh ? { refresh: nav.refresh } : nav),
}));
vi.mock("@/lib/auth/client-api", () => api);

const button = () => screen.getByRole("button", { name: "Write me a fresh one" });
const click = () => act(async () => void fireEvent.click(button()));

describe("FreshNoteButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    nav.fresh = false;
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("queues a note, says it is being written and links to the run", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime="06:30" />);
    await click();
    expect(api.postJson).toHaveBeenCalledWith("/api/agents/run", { kind: "daily-note" });
    expect(screen.getByRole("status")).toHaveTextContent("Writing a fresh one now.");
    expect(screen.getByRole("link", { name: "Follow the run" })).toHaveAttribute(
      "href",
      "/agents/12",
    );
    expect(button()).toBeDisabled();
  });

  it("refreshes the page every 5 seconds while waiting, and stops once a newer note shows", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    const { rerender } = render(
      <FreshNoteButton latestAt="A" latestRun={null} tokenSet noteTime="06:30" />,
    );
    await click();
    act(() => void vi.advanceTimersByTime(5_000));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    rerender(<FreshNoteButton latestAt="B" latestRun={null} tokenSet noteTime="06:30" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(button()).toBeEnabled();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("says it is starting while the request is on its way", async () => {
    const pending: { resolve: (value: unknown) => void } = { resolve: () => undefined };
    api.postJson.mockReturnValue(
      new Promise((resolve) => {
        pending.resolve = resolve;
      }),
    );
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime="06:30" />);
    await click();
    expect(screen.getByRole("status")).toHaveTextContent("Starting…");
    expect(button()).toBeDisabled();
    await act(async () => pending.resolve({ ok: true, data: { jobIds: [12] } }));
    expect(screen.getByRole("status")).toHaveTextContent("Writing a fresh one now.");
  });

  describe("when its own run ends", () => {
    const ask = async (latestRun: LatestRun | null, latestAt: string | null = "A") => {
      api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
      const view = (run: LatestRun | null) => (
        <FreshNoteButton latestAt={latestAt} latestRun={run} tokenSet noteTime="06:30" />
      );
      const { rerender } = render(view(latestRun));
      await click();
      return { rerender, view };
    };

    it("says calmly that a rejected note was not shown, stops refreshing and frees the button", async () => {
      const { rerender, view } = await ask({ id: 11, status: "ok" });
      act(() => void vi.advanceTimersByTime(5_000));
      rerender(view({ id: 12, status: "failed" }));
      expect(screen.getByRole("status")).toHaveTextContent(
        "That note didn't pass Harbour's checks, so nothing was shown. You can try again.",
      );
      expect(button()).toBeEnabled();
      expect(screen.queryByRole("link", { name: "Follow the run" })).toBeNull();
      nav.refresh.mockClear();
      act(() => void vi.advanceTimersByTime(60_000));
      expect(nav.refresh).not.toHaveBeenCalled();
    });

    it("stops waiting when a note re-written in the same minute succeeded (same stamp)", async () => {
      const { rerender, view } = await ask({ id: 11, status: "ok" });
      expect(screen.getByRole("status")).toHaveTextContent("Writing a fresh one now.");
      rerender(view({ id: 12, status: "running" }));
      expect(screen.getByRole("status")).toHaveTextContent("Writing a fresh one now.");
      rerender(view({ id: 12, status: "ok" }));
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(button()).toBeEnabled();
    });

    it("can be asked again after a failure", async () => {
      const { rerender, view } = await ask({ id: 11, status: "ok" });
      rerender(view({ id: 12, status: "failed" }));
      api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [13] } });
      await click();
      expect(screen.getByRole("status")).toHaveTextContent("Writing a fresh one now.");
      expect(screen.getByRole("link", { name: "Follow the run" })).toHaveAttribute(
        "href",
        "/agents/13",
      );
    });
  });

  it("still gives up after ten minutes when the router object changes on every render", async () => {
    nav.fresh = true;
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    const view = <FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime="06:30" />;
    const { rerender } = render(view);
    await click();
    act(() => void vi.advanceTimersByTime(9 * 60_000));
    rerender(view); // a new router object restarts the timer, but not the count
    act(() => void vi.advanceTimersByTime(3 * 60_000));
    expect(nav.refresh).toHaveBeenCalledTimes(120);
    expect(screen.getByRole("status")).toHaveTextContent("Still waiting for the worker.");
  });

  it("gives up after ten minutes with a calm pointer to the Agents page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime="06:30" />);
    await click();
    act(() => void vi.advanceTimersByTime(10 * 60_000 + 5_000));
    expect(nav.refresh).toHaveBeenCalledTimes(120);
    expect(screen.getByRole("status")).toHaveTextContent("Still waiting for the worker.");
    expect(button()).toBeEnabled();
  });

  it("does not promise a scheduled note when none is running", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "rate_limited" });
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime={null} />);
    await click();
    expect(screen.getByRole("status")).toHaveTextContent(
      "That's plenty of notes for one day. You can ask again tomorrow.",
    );
  });

  it.each([
    ["rate_limited", "That's plenty of notes for one day. Tomorrow's is written at 06:30."],
    ["token_missing", "Notes need Harbour's Claude token."],
    ["network_error", "Harbour couldn't start a note just now."],
  ])("explains a %s answer in plain words, without refreshing", async (error, text) => {
    api.postJson.mockResolvedValue({ ok: false, error });
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime="06:30" />);
    await click();
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it("is disabled, with the reason, when Harbour has no Claude token", () => {
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet={false} noteTime="06:30" />);
    expect(button()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Notes need Harbour's Claude token.");
  });

  describe("the /design examples of its states", () => {
    const example = (demoState: ExampleButtonState, noteTime: string | null = "06:30") =>
      render(
        <FreshNoteButton
          latestAt={null}
          latestRun={null}
          tokenSet
          noteTime={noteTime}
          demo
          demoState={demoState}
        />,
      );

    it.each([
      ["waiting", "Writing a fresh one now."],
      ["rate-limited", "That's plenty of notes for one day. Tomorrow's is written at 06:30."],
      ["failed", "Harbour couldn't start a note just now."],
      ["rejected", "That note didn't pass Harbour's checks, so nothing was shown."],
    ] as const)("shows the %s message", (state, text) => {
      example(state);
      expect(screen.getByRole("status")).toHaveTextContent(text);
    });

    it("keeps the button off while waiting, and the other states ask again", () => {
      example("waiting");
      expect(button()).toBeDisabled();
    });

    it("never refreshes, times out or links to a run", () => {
      example("waiting");
      act(() => void vi.advanceTimersByTime(11 * 60_000));
      expect(nav.refresh).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Writing a fresh one now.");
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("leaves the other states' button free", () => {
      example("rejected");
      expect(button()).toBeEnabled();
    });
  });

  it("changes nothing in the /design example", async () => {
    render(<FreshNoteButton latestAt={null} latestRun={null} tokenSet noteTime="06:30" demo />);
    await click();
    expect(api.postJson).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(DEMO_NOTE);
  });
});
