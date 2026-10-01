const PADDING = 1;

/** Converts a series into SVG polyline points inside a width × height box. */
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = width / (values.length - 1);
  const usable = height - PADDING * 2;
  return values
    .map((value, index) => {
      const x = Math.round(index * step);
      const y = range === 0 ? height / 2 : PADDING + usable - ((value - min) / range) * usable;
      return `${x},${Math.round(y)}`;
    })
    .join(" ");
}
