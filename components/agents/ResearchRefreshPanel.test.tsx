// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { RefreshPanelView } from "@/lib/agents/refresh-view";
import { ResearchRefreshPanel } from "./ResearchRefreshPanel";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const view: RefreshPanelView = {
  schedule: "Next scheduled refresh: Sunday 1 Nov, 21:00",
  total: 10,
  due: [
    { title: "Local SEO", age: "date unknown" },
    { title: "Glossary", age: "researched 10 Jan" },
  ],
  missing: 2,
  tokenSet: true,
};
const button = () => screen.getByRole("button", { name: "Refresh stale research" });

describe("ResearchRefreshPanel", () => {
  afterEach(() => vi.resetAllMocks());

  it("shows the schedule, the due documents and the ones not written yet", () => {
    render(<ResearchRefreshPanel view={view} />);
    expect(screen.getByRole("heading", { name: "Research refresh" })).toBeInTheDocument();
    expect(screen.getByText("Next scheduled refresh: Sunday 1 Nov, 21:00")).toBeInTheDocument();
    expect(screen.getByText("2 of 10 documents are due for a refresh")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Local SEO — date unknown", "Glossary — researched 10 Jan"]);
    expect(screen.getByText("2 not written yet — run the research sprint")).toBeInTheDocument();
    expect(button()).toBeEnabled();
  });

  it("queues refreshes and announces how many", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [4, 5, 6], stale: 4 } });
    render(<ResearchRefreshPanel view={view} />);
    fireEvent.click(button());
    expect(await screen.findByText("Queued 3 refreshes")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Queued 3 refreshes");
    expect(api.postJson).toHaveBeenCalledWith("/api/agents/run", { kind: "refresh" });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("says when nothing was stale after all", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [], stale: 0 } });
    render(<ResearchRefreshPanel view={view} />);
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Nothing is stale");
  });

  it("shows an error when the refresh could not be queued", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "network_error" });
    render(<ResearchRefreshPanel view={view} />);
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't queue the refresh");
    expect(button()).toBeEnabled();
  });

  it("disables the button without a token or when nothing is due, saying why", () => {
    const { rerender } = render(<ResearchRefreshPanel view={{ ...view, tokenSet: false }} />);
    expect(button()).toBeDisabled();
    expect(button()).toHaveAccessibleDescription(
      "Refreshing needs a Claude token (HARBOUR_CLAUDE_OAUTH_TOKEN).",
    );
    rerender(<ResearchRefreshPanel view={{ ...view, due: [], missing: 0 }} />);
    expect(screen.getByText("0 of 10 documents are due for a refresh")).toBeInTheDocument();
    expect(button()).toBeDisabled();
    expect(button()).toHaveAccessibleDescription("Nothing is due for a refresh.");
    expect(screen.queryByText(/not written yet/)).toBeNull();
  });
});
