// The ocean behind every page (warm-friend spec §5, plain-language spec "Ocean background"): the
// layers, defined once so the component draws what the contrast test checks.

/** The drawing is two screens wide, so sliding it by half its width loops without a jump. */
export const WAVE_WIDTH = 2880;
export const WAVE_HEIGHT = 160;
/** The resting water line, near the top of the drawing so each layer is mostly water. */
export const WAVE_CREST_Y = 28;

/** The semantic colour tokens the ocean is painted with (design/tokens.css). */
export const OCEAN_TOKENS = ["ocean-sky-fade", "ocean-1", "ocean-2", "ocean-3"] as const;
export type OceanToken = (typeof OCEAN_TOKENS)[number];

export type WaveLayer = {
  id: string;
  /** The layer's solid fill: one ocean token, so every wave pixel is a colour the test checks. */
  token: Exclude<OceanToken, "ocean-sky-fade">;
  /** Seconds for one drift across half the drawing: slow, and different per layer. */
  seconds: number;
  /** Seconds for one gentle rise or fall (the bob alternates, so a full swell is twice this). */
  bobSeconds: number;
  /** Where in its loop the layer starts (0 to 1), so the crests never line up. */
  phase: number;
  /** Height of the layer's box, as a percentage of the ocean area. */
  heightPct: number;
  amplitude: number;
  /** Whole waves across one screen width (the drawing holds twice as many). */
  cycles: number;
};

/**
 * Back to front: paler, slower water behind, a little deeper and quicker in front, like a view
 * out to sea. Each layer is opaque, so the front colour is the most intense pixel; every text
 * colour keeps WCAG AA on every ocean token in light, dark and system dark
 * (design/wave-contrast.test.ts). If that test fails, soften a token, never the threshold.
 */
export const WAVE_LAYERS: readonly WaveLayer[] = [
  {
    id: "far",
    token: "ocean-1",
    seconds: 40,
    bobSeconds: 9,
    phase: 0,
    heightPct: 100,
    amplitude: 14,
    cycles: 1,
  },
  {
    id: "middle",
    token: "ocean-2",
    seconds: 32,
    bobSeconds: 7,
    phase: 0.35,
    heightPct: 72,
    amplitude: 11,
    cycles: 2,
  },
  {
    id: "near",
    token: "ocean-3",
    seconds: 26,
    bobSeconds: 5.5,
    phase: 0.7,
    heightPct: 46,
    amplitude: 8,
    cycles: 3,
  },
];

/** A closed SVG path: a sine-like wave along the top (quadratic curves), flat along the bottom. */
export function wavePath({ amplitude, cycles }: Pick<WaveLayer, "amplitude" | "cycles">): string {
  const halves = cycles * 4; // two screens wide, two half-waves per cycle
  const half = WAVE_WIDTH / halves;
  const mid = WAVE_CREST_Y;
  let path = `M0,${mid} Q${half / 2},${mid - amplitude} ${half},${mid}`;
  for (let i = 2; i <= halves; i++) path += ` T${half * i},${mid}`;
  return `${path} L${WAVE_WIDTH},${WAVE_HEIGHT} L0,${WAVE_HEIGHT} Z`;
}
