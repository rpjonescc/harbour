// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MoveMenu } from "./MoveMenu";

const TITLE = "Add a title to the pricing page";

function renderMenu() {
  const onMove = vi.fn();
  render(<MoveMenu title={TITLE} current="queue" onMove={onMove} />);
  return { onMove, trigger: screen.getByRole("button", { name: `Move to… ${TITLE}` }) };
}

describe("MoveMenu", () => {
  it("starts closed", () => {
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click (Enter and Space on a button) and lists every other column", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: `Move ${TITLE} to` })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Backlog",
      "Started",
      "In progress",
      "In review",
      "Done",
    ]);
    expect(screen.getByRole("menuitem", { name: "Backlog" })).toHaveFocus();
  });

  it("moves with the arrow keys, wraps, and Home and End jump", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Started" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Done" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "Backlog" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Done" })).toHaveFocus();
  });

  it("opens from ArrowUp on the button at the last column", () => {
    const { trigger } = renderMenu();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Done" })).toHaveFocus();
  });

  it("chooses with Enter (a click on the item), closes and gives focus back", () => {
    const { trigger, onMove } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Started" }));
    expect(onMove).toHaveBeenCalledWith("started");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape without moving and gives focus back", () => {
    const { trigger, onMove } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("gives every item a touch-sized target", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    for (const item of screen.getAllByRole("menuitem"))
      expect(item.className).toContain("min-h-11");
  });

  it("closes when focus leaves the menu for somewhere else", () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.blur(screen.getByRole("menuitem", { name: "Backlog" }), {
      relatedTarget: document.body,
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the menu in the top layer, so the sideways-scrolling lanes cannot clip it", () => {
    // jsdom has no popover API; stand in for the browser's.
    const showPopover = vi.fn();
    HTMLElement.prototype.showPopover = showPopover;
    try {
      const { trigger } = renderMenu();
      fireEvent.click(trigger);
      const menu = screen.getByRole("menu", { hidden: true });
      expect(showPopover).toHaveBeenCalledOnce();
      expect(menu).toHaveAttribute("popover", "manual");
      expect(menu.className).toContain("fixed");
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
    }
  });
});
