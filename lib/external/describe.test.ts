import { describeCopy } from "./describe";

describe("describeCopy", () => {
  it.each([
    [0, 0, "Outside view: kept 0 new checks"],
    [1, 0, "Outside view: kept 1 new check"],
    [4, 0, "Outside view: kept 4 new checks"],
    [1, 1, "Outside view: kept 1 new check, 1 failed their shape and was dropped"],
    [3, 2, "Outside view: kept 3 new checks, 2 failed their shape and were dropped"],
  ])("says %s kept and %s dropped", (written, dropped, text) => {
    expect(describeCopy({ written, dropped })).toBe(text);
  });
});
