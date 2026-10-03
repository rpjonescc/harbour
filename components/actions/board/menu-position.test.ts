import { menuPosition } from "./menu-position";

const GAP = 4;
const trigger = (top: number, right = 320) => ({ top, bottom: top + 44, left: right - 44, right });
const menu = (height: number) => ({ height, width: 192 });
const window = { height: 800, width: 1024 };

describe("menuPosition", () => {
  it("opens below the button when the menu fits under it, its right edge on the button's", () => {
    expect(menuPosition(trigger(100), menu(230), window)).toEqual({
      top: 144 + GAP,
      left: 320 - 192,
    });
  });

  it("opens above the button when there is no room below", () => {
    expect(menuPosition(trigger(700), menu(230), window).top).toBe(700 - 230 - GAP);
  });

  it("stays below when neither side has room, so the page can scroll to it", () => {
    expect(menuPosition(trigger(100), menu(900), window).top).toBe(144 + GAP);
  });

  it("never runs off the left or right edge of a narrow window", () => {
    expect(menuPosition(trigger(100, 100), menu(230), { height: 800, width: 390 }).left).toBe(8);
    expect(menuPosition(trigger(100, 600), menu(230), { height: 800, width: 390 }).left).toBe(
      390 - 192 - 8,
    );
  });
});
