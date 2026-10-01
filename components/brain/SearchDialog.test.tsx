// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchDialog } from "./SearchDialog";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const hit = {
  path: "research/geo/how-ai-engines-pick-sources.md",
  title: "How AI engines pick their sources",
  snippet: [
    { text: "…", hit: false },
    { text: "Perplexity", hit: true },
    { text: " cites", hit: false },
  ],
};

function stubFetch(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

describe("SearchDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
  });

  it("opens with Ctrl+K, searches, and opens the chosen result with Enter", async () => {
    stubFetch(Response.json({ hits: [hit] }));
    render(<SearchDialog />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox", { name: "Search the Second Brain" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "perplex" } });
    const option = await screen.findByRole("option", { name: /How AI engines pick their sources/ });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Perplexity").tagName).toBe("MARK");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/brain/research/geo/how-ai-engines-pick-sources.md");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the trigger", () => {
    stubFetch(Response.json({ hits: [] }));
    render(<SearchDialog />);
    const trigger = screen.getByRole("button", { name: /Search/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves the active result with arrow keys", async () => {
    stubFetch(
      Response.json({ hits: [hit, { ...hit, path: "research/other.md", title: "Other" }] }),
    );
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "research" } });
    await screen.findByRole("option", { name: /Other/ });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Other/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/brain/research/other.md");
  });

  it("scrolls the active result into view during keyboard navigation", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    stubFetch(
      Response.json({
        hits: Array.from({ length: 10 }, (_, i) => ({
          ...hit,
          path: `research/result-${i}.md`,
          title: `Result ${i}`,
        })),
      }),
    );
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "result" } });
    await screen.findByRole("option", { name: /Result 9/ });
    scroll.mockClear();
    for (let i = 0; i < 9; i += 1) fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Result 9/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("closes when the backdrop is clicked", () => {
    stubFetch(Response.json({ hits: [] }));
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error when search fails", async () => {
    stubFetch(new Response("nope", { status: 500 }));
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Search failed"));
  });

  it("says the Second Brain is unavailable on 409", async () => {
    stubFetch(Response.json({ error: "brain_unavailable" }, { status: 409 }));
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x" } });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Second Brain unavailable"),
    );
  });

  it.each([
    ["MacIntel", "⌘K"],
    ["Win32", "Ctrl K"],
    ["Linux x86_64", "Ctrl K"],
  ])("shows the shortcut for %s", (platform, label) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    render(<SearchDialog />);
    expect(screen.getByRole("button", { name: /Search/ })).toHaveTextContent(label);
    vi.restoreAllMocks();
  });

  it("rejects a malformed search response", async () => {
    stubFetch(Response.json({ hits: {} }));
    render(<SearchDialog />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Search failed"));
  });
});
