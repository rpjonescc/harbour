// The wave behind the app (spec §5): the layers, defined once so the component draws what the
// contrast test checks.

/** The drawing is two screens wide, so sliding it by half its width loops without a jump. */
export const WAVE_WIDTH = 2880;
export const WAVE_HEIGHT = 160;

export type WaveLayer = {
  id: string;
  /** Fill opacity of the tide tint (--accent-soft). */
  opacity: number;
  /** Seconds for one drift across half the drawing: slow, and different per layer. */
  seconds: number;
  /** Height of the layer's box, as a percentage of the wave area. */
  heightPct: number;
  amplitude: number;
  /** Whole waves across one screen width (the drawing holds twice as many). */
  cycles: number;
};

/**
 * Back to front. Their opacities are chosen so that all three stacked on one pixel still leave
 * every text colour at WCAG AA over the page background in light, dark and system-dark
 * (design/wave-contrast.test.ts). If that test fails, lower an opacity here, never the threshold.
 */
export const WAVE_LAYERS: readonly WaveLayer[] = [
  { id: "deep", opacity: 0.1, seconds: 140, heightPct: 100, amplitude: 28, cycles: 1 },
  { id: "middle", opacity: 0.06, seconds: 95, heightPct: 80, amplitude: 22, cycles: 2 },
  { id: "near", opacity: 0.04, seconds: 60, heightPct: 60, amplitude: 16, cycles: 3 },
];

/** A closed SVG path: a sine-like wave along the top (quadratic curves), flat along the bottom. */
export function wavePath({ amplitude, cycles }: Pick<WaveLayer, "amplitude" | "cycles">): string {
  const halves = cycles * 4; // two screens wide, two half-waves per cycle
  const half = WAVE_WIDTH / halves;
  const mid = WAVE_HEIGHT / 2;
  let path = `M0,${mid} Q${half / 2},${mid - amplitude} ${half},${mid}`;
  for (let i = 2; i <= halves; i++) path += ` T${half * i},${mid}`;
  return `${path} L${WAVE_WIDTH},${WAVE_HEIGHT} L0,${WAVE_HEIGHT} Z`;
}
