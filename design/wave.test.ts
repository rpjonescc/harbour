import { WAVE_HEIGHT, WAVE_LAYERS, WAVE_WIDTH, wavePath } from "./wave";

describe("wavePath", () => {
  const path = wavePath({ amplitude: 20, cycles: 2 });
  const endpoints = [...path.matchAll(/[QT]\s*(?:[\d.]+,[\d.]+\s+)?([\d.]+),([\d.]+)/g)].map(
    (m) => [Number(m[1]), Number(m[2])],
  );

  it("is one closed shape: a wave along the top, down the sides and back along the bottom", () => {
    expect(path.startsWith(`M0,${WAVE_HEIGHT / 2} Q`)).toBe(true);
    expect(path.endsWith(`L${WAVE_WIDTH},${WAVE_HEIGHT} L0,${WAVE_HEIGHT} Z`)).toBe(true);
  });

  it("has four half-waves a cycle across the double-width drawing", () => {
    expect(endpoints).toHaveLength(4 * 2);
    expect(endpoints.at(-1)).toEqual([WAVE_WIDTH, WAVE_HEIGHT / 2]);
  });

  it("repeats at half its width, so the drift loops without a jump", () => {
    for (const { cycles, amplitude } of WAVE_LAYERS) {
      expect(Number.isInteger(cycles)).toBe(true);
      const points = [
        ...wavePath({ cycles, amplitude }).matchAll(
          /[QT]\s*(?:[\d.]+,[\d.]+\s+)?([\d.]+),([\d.]+)/g,
        ),
      ];
      const xs = points.map((m) => Number(m[1]));
      expect(xs).toContain(WAVE_WIDTH / 2);
    }
  });
});

describe("WAVE_LAYERS", () => {
  it("are drawn at different speeds, each slow", () => {
    const seconds = WAVE_LAYERS.map((l) => l.seconds);
    expect(new Set(seconds).size).toBe(seconds.length);
    expect(Math.min(...seconds)).toBeGreaterThanOrEqual(45);
  });

  it("are faint: no layer above 12% opacity", () => {
    for (const layer of WAVE_LAYERS) expect(layer.opacity).toBeLessThanOrEqual(0.12);
  });
});
