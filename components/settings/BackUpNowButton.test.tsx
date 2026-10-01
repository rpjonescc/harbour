// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { BackUpNowButton } from "./BackUpNowButton";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const button = () => screen.getByRole("button", { name: "Back up now" });

describe("BackUpNowButton", () => {
  afterEach(() => vi.resetAllMocks());

  it("queues a backup with an empty body and opens its job page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 12, created: true } });
    render(<BackUpNowButton />);
    fireEvent.click(button());
    expect(button()).toBeDisabled();
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/agents/12"));
    expect(api.postJson).toHaveBeenCalledWith("/api/backups", {});
  });

  it("opens the running backup when one was already queued", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 9, created: false } });
    render(<BackUpNowButton />);
    fireEvent.click(button());
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/agents/9"));
  });

  it("shows an error and re-enables the button when queueing fails", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "network_error" });
    render(<BackUpNowButton />);
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't queue the backup");
    expect(button()).toBeEnabled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("never calls the API as a /design example", async () => {
    render(<BackUpNowButton demo />);
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Example only");
    expect(api.postJson).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });
});
