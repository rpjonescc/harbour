// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { OutsideCheckButton } from "./OutsideCheckButton";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const button = () => screen.getByRole("button", { name: "Run this check now" });
const draw = (props: Partial<Parameters<typeof OutsideCheckButton>[0]> = {}) =>
  render(<OutsideCheckButton productId="acme-docs" active={null} refusal={null} {...props} />);

describe("OutsideCheckButton", () => {
  afterEach(() => vi.resetAllMocks());

  it("queues a check for the product, confirms it and refreshes the page", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 4, created: true } });
    draw();
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Checking now.");
    expect(api.postJson).toHaveBeenCalledWith("/api/outside-checks", { productId: "acme-docs" });
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("says when a check was already on its way", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 4, created: false } });
    draw();
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("A check is already on its way.");
  });

  it.each([
    ["budget_used_up", "budget for paid checks is used up"],
    ["too_soon", "checked in the last 6 hours"],
    ["daily_cap", "already been checked 3 times today"],
    ["key_missing", "Treg isn't connected"],
    ["no_searches", "No searches have been chosen"],
  ])("shows the server's refusal %s in plain words", async (error, words) => {
    api.postJson.mockResolvedValue({ ok: false, error });
    draw();
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent(words);
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("never shows an error code it doesn't know, and stays usable", async () => {
    api.postJson.mockResolvedValue({ ok: false, error: "SENTINEL_code", message: "SENTINEL text" });
    draw();
    fireEvent.click(button());
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Harbour couldn't start the check");
    expect(status).not.toHaveTextContent("SENTINEL");
    expect(button()).toBeEnabled();
  });

  it("is disabled, saying why, while a check is queued or running", () => {
    draw({ active: "running" });
    expect(button()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("A check is already on its way.");
  });

  it("says why a check would be refused, but lets the owner try", () => {
    draw({ refusal: "too_soon" });
    expect(screen.getByRole("status")).toHaveTextContent("checked in the last 6 hours");
    expect(button()).toBeEnabled();
  });

  it("drops the click's note once the check it started has finished", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { jobId: 4, created: true } });
    const { rerender } = draw();
    fireEvent.click(button());
    expect(await screen.findByRole("status")).toHaveTextContent("Checking now.");
    rerender(<OutsideCheckButton productId="acme-docs" active="running" refusal={null} />);
    rerender(<OutsideCheckButton productId="acme-docs" active={null} refusal="too_soon" />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Checking now.");
    expect(screen.getByRole("status")).toHaveTextContent("checked in the last 6 hours");
  });

  it("queues nothing in the /design example", () => {
    draw({ demo: true });
    fireEvent.click(button());
    expect(api.postJson).not.toHaveBeenCalled();
  });
});
