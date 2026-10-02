import { contrastRatio, over, parseHex } from "./contrast";

const WHITE = parseHex("#ffffff");
const BLACK = parseHex("#000000");

describe("WCAG contrast", () => {
  it("reads #rrggbb colours only", () => {
    expect(parseHex("#1f6b5a")).toEqual([31, 107, 90]);
    expect(() => parseHex("#fff")).toThrow(/#rrggbb/);
    expect(() => parseHex("rebeccapurple")).toThrow(/#rrggbb/);
  });

  it("gives 21:1 for black on white and 1:1 for a colour on itself", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("matches the known AA boundary: #767676 on white is 4.54:1", () => {
    expect(contrastRatio(parseHex("#767676"), WHITE)).toBeCloseTo(4.54, 2);
  });

  it("blends a colour over another by its opacity", () => {
    expect(over(WHITE, BLACK, 0)).toEqual([255, 255, 255]);
    expect(over(WHITE, BLACK, 1)).toEqual([0, 0, 0]);
    expect(over(WHITE, BLACK, 0.5)).toEqual([127.5, 127.5, 127.5]);
  });
});
