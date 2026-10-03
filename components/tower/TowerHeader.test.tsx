// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TowerHeader } from "./TowerHeader";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const renderHeader = (subline: string) =>
  render(
    <TowerHeader
      headline="The worker isn't running, so checks, backups and agents are waiting."
      subline={subline}
      now={new Date("2026-10-02T08:42:00Z")}
      timeZone="Europe/London"
      locale="en-GB"
      active={false}
    />,
  );

describe("TowerHeader", () => {
  it("reads the headline as the h1, its sub-line in a polite live region", () => {
    renderHeader("1 more thing needs you.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "The worker isn't running, so checks, backups and agents are waiting. 1 more thing needs you.",
    );
    const live = screen.getByText("1 more thing needs you.");
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("updates the live sub-line in place when a refresh changes it", () => {
    const { rerender } = renderHeader("1 more thing needs you.");
    const live = screen.getByText("1 more thing needs you.");
    rerender(
      <TowerHeader
        headline="Everything is running."
        subline="Nothing needs you right now."
        now={new Date("2026-10-02T08:43:00Z")}
        timeZone="Europe/London"
        locale="en-GB"
        active={false}
      />,
    );
    expect(live).toHaveTextContent("Nothing needs you right now.");
    expect(screen.getByText(/updated 09:43/)).toBeVisible();
  });

  it("offers What's this page? with its keyboard shortcut", () => {
    renderHeader("Nothing else needs you.");
    expect(screen.getByRole("button", { name: /What's this page\?/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "?",
    );
  });

  it("keeps the jump links one sideways-scrolling row below the wide layout", () => {
    renderHeader("Nothing else needs you.");
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.className).toMatch(/(^| )flex-nowrap( |$)/);
    expect(nav.className).toContain("overflow-x-auto");
    expect(nav.className).toContain("lg:flex-wrap");
    expect(nav.querySelectorAll("a")).toHaveLength(6);
  });
});
