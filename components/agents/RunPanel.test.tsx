// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { CLAUDE_OFF } from "@/lib/explain/claude";
import { textOutsideDetails } from "@/tests/helpers/plain-text";
import { RunPanel } from "./RunPanel";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const products = [{ id: "acme-docs", name: "Acme Docs" }];

describe("RunPanel", () => {
  afterEach(() => vi.resetAllMocks());

  it("confirms how many research runs were queued", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [1, 2, 3] } });
    render(<RunPanel products={products} tokenSet />);
    fireEvent.click(screen.getByRole("button", { name: "Run all research" }));
    expect(await screen.findByText("Started 3 research runs")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("opens a single run's page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [9] } });
    render(<RunPanel products={products} tokenSet />);
    fireEvent.click(screen.getByRole("button", { name: "Find ideas for Acme Docs" }));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/agents/9"));
  });

  it("shows an error when nothing was queued", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [] } });
    render(<RunPanel products={products} tokenSet />);
    fireEvent.click(screen.getByRole("button", { name: "Run all research" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was started");
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("explains in plain words that Claude isn't connected, with the steps under Technical details", () => {
    const { container } = render(<RunPanel products={products} tokenSet={false} />);
    expect(screen.getByText(CLAUDE_OFF)).toBeInTheDocument();
    expect(textOutsideDetails(container)).not.toMatch(/HARBOUR_[A-Z_]+|setup-token/);
    expect(screen.getByRole("button", { name: "Find ideas for Acme Docs" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run all research" })).toBeDisabled();
  });
});
