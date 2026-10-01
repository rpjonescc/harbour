// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { WeeklyPanelView } from "@/lib/analyst/panel-view";
import { WeeklyAnalystPanel } from "./WeeklyAnalystPanel";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const view: WeeklyPanelView = {
  schedule: "Next scheduled run: Sunday 4 Oct, 20:00",
  latestReport: { week: "2026-W39", href: "/brain/reports/weekly/2026-W39.md" },
  tokenSet: true,
};
const button = () => screen.getByRole("button", { name: "Run weekly report now" });

describe("WeeklyAnalystPanel", () => {
  afterEach(() => vi.resetAllMocks());

  it("shows the next scheduled run and links the latest report", () => {
    render(<WeeklyAnalystPanel view={view} />);
    expect(screen.getByRole("heading", { name: "Weekly report" })).toBeInTheDocument();
    expect(screen.getByText("Next scheduled run: Sunday 4 Oct, 20:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Latest report: 2026-W39" })).toHaveAttribute(
      "href",
      "/brain/reports/weekly/2026-W39.md",
    );
  });

  it("says when there is no report yet", () => {
    render(<WeeklyAnalystPanel view={{ ...view, latestReport: null }} />);
    expect(screen.getByText("No weekly report yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("queues a run and opens its page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [12] } });
    render(<WeeklyAnalystPanel view={view} />);
    fireEvent.click(button());
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/agents/12"));
    expect(api.postJson).toHaveBeenCalledWith("/api/agents/run", { kind: "weekly-analyst" });
  });

  it("shows an error when the run could not be queued", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "network_error" });
    render(<WeeklyAnalystPanel view={view} />);
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't queue the weekly report");
    expect(button()).toBeEnabled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("disables the button without a token, saying why", () => {
    render(<WeeklyAnalystPanel view={{ ...view, tokenSet: false }} />);
    expect(button()).toBeDisabled();
    expect(button()).toHaveAccessibleDescription(
      "Run now needs a Claude token (HARBOUR_CLAUDE_OAUTH_TOKEN).",
    );
  });
});
