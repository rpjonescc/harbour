// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DEMO_NOTE } from "@/components/actions/action-labels";
import { FreshNoteButton } from "./FreshNoteButton";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const button = () => screen.getByRole("button", { name: "Write me a fresh one" });
const click = () => act(async () => void fireEvent.click(button()));

describe("FreshNoteButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("queues a note, says it is being written and links to the run", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    render(<FreshNoteButton latestAt={null} tokenSet noteTime="06:30" />);
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
    const { rerender } = render(<FreshNoteButton latestAt="A" tokenSet noteTime="06:30" />);
    await click();
    act(() => void vi.advanceTimersByTime(5_000));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    rerender(<FreshNoteButton latestAt="B" tokenSet noteTime="06:30" />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(button()).toBeEnabled();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("gives up after ten minutes with a calm pointer to the Agents page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    render(<FreshNoteButton latestAt={null} tokenSet noteTime="06:30" />);
    await click();
    act(() => void vi.advanceTimersByTime(10 * 60_000 + 5_000));
    expect(nav.refresh).toHaveBeenCalledTimes(120);
    expect(screen.getByRole("status")).toHaveTextContent("Still waiting for the worker.");
    expect(button()).toBeEnabled();
  });

  it.each([
    ["rate_limited", "That's plenty of notes for one day. Tomorrow's is written at 06:30."],
    ["token_missing", "Notes need Harbour's Claude token."],
    ["network_error", "Harbour couldn't start a note just now."],
  ])("explains a %s answer in plain words, without refreshing", async (error, text) => {
    api.postJson.mockResolvedValue({ ok: false, error });
    render(<FreshNoteButton latestAt={null} tokenSet noteTime="06:30" />);
    await click();
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it("is disabled, with the reason, when Harbour has no Claude token", () => {
    render(<FreshNoteButton latestAt={null} tokenSet={false} noteTime="06:30" />);
    expect(button()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Notes need Harbour's Claude token.");
  });

  it("changes nothing in the /design example", async () => {
    render(<FreshNoteButton latestAt={null} tokenSet noteTime="06:30" demo />);
    await click();
    expect(api.postJson).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(DEMO_NOTE);
  });
});
