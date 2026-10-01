// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { ScanNowButton } from "./ScanNowButton";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const button = () => screen.getByRole("button", { name: "Scan now" });

describe("ScanNowButton", () => {
  afterEach(() => vi.resetAllMocks());

  it("queues a scan of the product, confirms it and refreshes the page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 7, created: true } });
    render(<ScanNowButton productId="acme-docs" active={null} />);
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Scan queued");
    expect(api.postJson).toHaveBeenCalledWith("/api/scans", { productId: "acme-docs" });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("says when a scan was already queued", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 7, created: false } });
    render(<ScanNowButton productId="acme-docs" active={null} />);
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("A scan is already queued");
  });

  it("reports a failure without refreshing", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "network_error" });
    render(<ScanNowButton productId="acme-docs" active={null} />);
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't queue the scan");
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it("is disabled while a scan is queued or running", () => {
    render(<ScanNowButton productId="acme-docs" active="running" />);
    expect(button()).toBeDisabled();
  });
});

describe("ScanNowButton demo", () => {
  afterEach(() => vi.resetAllMocks());

  it("never queues a scan in demo mode", async () => {
    render(<ScanNowButton productId="acme-docs" active={null} demo />);
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Example only — nothing changed");
    expect(api.postJson).not.toHaveBeenCalled();
  });
});
