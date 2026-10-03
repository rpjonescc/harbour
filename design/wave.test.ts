import { OCEAN_TOKENS, WAVE_CREST_Y, WAVE_HEIGHT, WAVE_LAYERS, WAVE_WIDTH, wavePath } from "./wave";

describe("wavePath", () => {
  const path = wavePath({ amplitude: 20, cycles: 2 });
  const endpoints = [...path.matchAll(/[QT]\s*(?:[\d.]+,[\d.]+\s+)?([\d.]+),([\d.]+)/g)].map(
    (m) => [Number(m[1]), Number(m[2])],
  );

  it("is one closed shape: a wave along the top, down the sides and back along the bottom", () => {
    expect(path.startsWith(`M0,${WAVE_CREST_Y} Q`)).toBe(true);
    expect(path.endsWith(`L${WAVE_WIDTH},${WAVE_HEIGHT} L0,${WAVE_HEIGHT} Z`)).toBe(true);
  });

  it("has four half-waves a cycle across the double-width drawing", () => {
    expect(endpoints).toHaveLength(4 * 2);
    expect(endpoints.at(-1)).toEqual([WAVE_WIDTH, WAVE_CREST_Y]);
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
  it("drift at different speeds, each a slow 24 to 40 second loop", () => {
    const seconds = WAVE_LAYERS.map((l) => l.seconds);
    expect(new Set(seconds).size).toBe(seconds.length);
    for (const s of seconds) {
      expect(s).toBeGreaterThanOrEqual(24);
      expect(s).toBeLessThanOrEqual(40);
    }
  });

  it("bob gently and out of step: different speeds and phases, never quicker than 5 seconds", () => {
    const bobs = WAVE_LAYERS.map((l) => l.bobSeconds);
    expect(new Set(bobs).size).toBe(bobs.length);
    expect(Math.min(...bobs)).toBeGreaterThanOrEqual(5);
    const phases = WAVE_LAYERS.map((l) => l.phase);
    expect(new Set(phases).size).toBe(phases.length);
  });

  it("keep every crest inside the drawing", () => {
    for (const { amplitude } of WAVE_LAYERS) expect(amplitude).toBeLessThan(WAVE_CREST_Y);
  });

  it("are each painted with their own ocean token, back to front", () => {
    expect(WAVE_LAYERS.map((l) => l.token)).toEqual(OCEAN_TOKENS.slice(1));
  });
});
