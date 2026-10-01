// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const postJson = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: (...args: unknown[]) => postJson(...args) }));

import { DeviceList } from "./DeviceList";

// 05:00 UTC on 1 October is still 30 September in Honolulu (UTC-10, no DST).
const device = {
  id: "a",
  deviceLabel: "Laptop",
  createdAt: new Date("2026-10-01T05:00:00Z"),
  lastUsedAt: null,
};

afterEach(() => {
  cleanup();
  refresh.mockReset();
  postJson.mockReset();
  vi.restoreAllMocks();
});

describe("DeviceList", () => {
  it("formats dates in the configured timezone, not the runtime's", () => {
    // The two zones fall on different dates: only honouring the prop can satisfy both.
    render(<DeviceList devices={[device]} timeZone="UTC" locale="en-GB" />);
    expect(screen.getByText(/Added 01\/10\/2026/)).toBeInTheDocument();
    cleanup();
    render(<DeviceList devices={[device]} timeZone="Pacific/Honolulu" locale="en-GB" />);
    expect(screen.getByText(/Added 30\/09\/2026/)).toBeInTheDocument();
  });

  it("formats dates in the configured locale", () => {
    render(<DeviceList devices={[device]} timeZone="UTC" locale="en-US" />);
    expect(screen.getByText(/Added 10\/1\/2026/)).toBeInTheDocument();
  });

  it("clears a previous error when retrying a removal", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    postJson.mockResolvedValueOnce({ ok: false, error: "network_error" });
    render(<DeviceList devices={[device]} timeZone="UTC" locale="en-GB" />);
    const button = screen.getByRole("button", { name: "Remove Laptop" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove that device.");

    let finish: (value: unknown) => void = () => {};
    postJson.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    finish({ ok: true, data: {} });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
