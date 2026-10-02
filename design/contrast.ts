// WCAG 2.x contrast maths, for the tests that guard the wave. Pure.
export type Rgb = readonly [number, number, number];

/** A `#rrggbb` colour as 0 to 255 channels. */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** `colour` laid over `base` at `alpha` (0 to 1), channels unrounded. */
export function over(base: Rgb, colour: Rgb, alpha: number): Rgb {
  const mix = (i: 0 | 1 | 2) => base[i] * (1 - alpha) + colour[i] * alpha;
  return [mix(0), mix(1), mix(2)];
}
