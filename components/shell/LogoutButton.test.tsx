// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const postJson = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth/client-api", () => ({ postJson: (...args: unknown[]) => postJson(...args) }));

import { LogoutButton } from "./LogoutButton";

afterEach(() => {
  cleanup();
  replace.mockReset();
  postJson.mockReset();
});

describe("LogoutButton", () => {
  it("redirects to /login after a successful sign-out", async () => {
    postJson.mockResolvedValue({ ok: true, data: {} });
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("stays put and shows an alert when sign-out fails", async () => {
    postJson.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect((await screen.findByRole("alert")).textContent).toBe("Sign-out failed. Try again.");
    expect(replace).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /sign out/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
