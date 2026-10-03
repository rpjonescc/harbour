// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TROUBLED_LIGHTS } from "@/components/design/tower-example-data";
import { LightDetails } from "./LightDetails";

describe("LightDetails", () => {
  it("names each light by its label and tone, closed at first", () => {
    render(<LightDetails lights={TROUBLED_LIGHTS} />);
    const worker = screen.getByRole("button", { name: "Worker: needs you" });
    expect(worker).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /How to fix/ })).toBeNull();
  });

  it("opens one light at a time with its sentence, its word explained and a link", () => {
    render(<LightDetails lights={TROUBLED_LIGHTS} />);
    const worker = screen.getByRole("button", { name: "Worker: needs you" });
    fireEvent.click(worker);
    expect(worker).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(worker.getAttribute("aria-controls") ?? "");
    if (!panel) throw new Error("no panel");
    expect(within(panel).getByText(/The worker isn't running/)).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Worker" })).toHaveAttribute(
      "aria-describedby",
    );
    expect(within(panel).getByRole("link", { name: "How to fix: Worker" })).toHaveAttribute(
      "href",
      "https://example.com/docs/deploy",
    );
    fireEvent.click(screen.getByRole("button", { name: "Spend: worth a look" }));
    expect(worker).toHaveAttribute("aria-expanded", "false");
    expect(within(panel).getByText("80% of this month's budget used.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Spend: worth a look" }));
    expect(panel).not.toBeVisible();
  });

  it("offers the page, not a fix, for a fine light, and no link where there is none", () => {
    render(<LightDetails lights={TROUBLED_LIGHTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Agents: working" }));
    expect(screen.getByRole("link", { name: "Open the page: Agents" })).toHaveAttribute(
      "href",
      "/agents",
    );
    fireEvent.click(screen.getByRole("button", { name: "Website: fine" }));
    expect(screen.queryByRole("link", { name: /Website/ })).toBeNull();
  });

  it("closes on Escape and gives focus back to the light", () => {
    render(<LightDetails lights={TROUBLED_LIGHTS} />);
    const checks = screen.getByRole("button", { name: "Checks: needs you" });
    fireEvent.click(checks);
    const link = screen.getByRole("link", { name: "How to fix: Checks" });
    link.focus();
    fireEvent.keyDown(link, { key: "Escape" });
    expect(checks).toHaveAttribute("aria-expanded", "false");
    expect(checks).toHaveFocus();
  });
});
