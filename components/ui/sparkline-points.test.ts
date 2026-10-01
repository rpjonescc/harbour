import { sparklinePoints } from "./sparkline-points";

describe("sparklinePoints", () => {
  it("maps values onto the box with higher values nearer the top", () => {
    expect(sparklinePoints([0, 10], 60, 20)).toBe("0,19 60,1");
  });

  it("draws a flat line in the middle when all values are equal", () => {
    expect(sparklinePoints([5, 5, 5], 60, 20)).toBe("0,10 30,10 60,10");
  });

  it("returns an empty string for fewer than two values", () => {
    expect(sparklinePoints([7], 60, 20)).toBe("");
    expect(sparklinePoints([], 60, 20)).toBe("");
  });
});
