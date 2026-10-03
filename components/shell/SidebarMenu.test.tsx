// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

import { SidebarMenu } from "./SidebarMenu";

afterEach(() => {
  cleanup();
  nav.path = "/";
});

function renderMenu() {
  const view = render(
    <SidebarMenu>
      <nav aria-label="Main">
        <a href="/">Today</a>
        <a href="/actions">Actions</a>
      </nav>
    </SidebarMenu>,
  );
  const button = screen.getByRole("button", { name: "Menu" });
  const menu = document.getElementById("site-menu");
  return { ...view, button, menu };
}

describe("SidebarMenu", () => {
  it("names its button Menu, says it controls the menu, and starts closed", () => {
    const { button, menu } = renderMenu();
    expect(button).toHaveAttribute("aria-controls", "site-menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    // Closed below md, always shown as the rail from md up.
    expect(menu).toHaveClass("hidden", "md:flex");
  });

  it("opens in place and moves focus to the first link", () => {
    const { button, menu } = renderMenu();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveClass("flex");
    expect(menu).not.toHaveClass("hidden");
    expect(screen.getByRole("link", { name: "Today" })).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the button", () => {
    const { button, menu } = renderMenu();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveClass("hidden");
    expect(button).toHaveFocus();
  });

  it("ignores other keys and Escape while closed", () => {
    const { button } = renderMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).not.toHaveFocus();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("closes when the page changes", () => {
    const { button, rerender } = renderMenu();
    fireEvent.click(button);
    nav.path = "/actions";
    act(() => {
      rerender(
        <SidebarMenu>
          <a href="/">Today</a>
        </SidebarMenu>,
      );
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closes with the button too", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
