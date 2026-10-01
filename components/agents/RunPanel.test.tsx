// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("button", { name: "Run all research topics" }));
    expect(await screen.findByText("Queued 3 research runs")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("opens a single run's page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [9] } });
    render(<RunPanel products={products} tokenSet />);
    fireEvent.click(screen.getByRole("button", { name: "Run discovery: Acme Docs" }));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/agents/9"));
  });

  it("shows an error when nothing was queued", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobIds: [] } });
    render(<RunPanel products={products} tokenSet />);
    fireEvent.click(screen.getByRole("button", { name: "Run all research topics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was queued");
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("disables the buttons without a token", () => {
    render(<RunPanel products={products} tokenSet={false} />);
    expect(screen.getByRole("note")).toHaveTextContent("Agents need a Claude token");
    expect(screen.getByRole("button", { name: "Run all research topics" })).toBeDisabled();
  });
});
