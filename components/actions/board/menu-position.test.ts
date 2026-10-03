import { menuPosition } from "./menu-position";

const GAP = 4;
const trigger = (top: number) => ({ top, bottom: top + 44, left: 120 });

describe("menuPosition", () => {
  it("opens below the button when the menu fits under it", () => {
    expect(menuPosition(trigger(100), 230, 800)).toEqual({ top: 144 + GAP, left: 120 });
  });

  it("opens above the button when there is no room below", () => {
    expect(menuPosition(trigger(700), 230, 800)).toEqual({ top: 700 - 230 - GAP, left: 120 });
  });

  it("stays below when neither side has room, so the page can scroll to it", () => {
    expect(menuPosition(trigger(100), 900, 800).top).toBe(144 + GAP);
  });
});
