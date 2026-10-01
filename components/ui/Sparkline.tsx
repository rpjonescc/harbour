import { sparklinePoints } from "./sparkline-points";

const WIDTH = 60;
const HEIGHT = 18;

/** Tiny trend line; `label` describes the trend for screen readers. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <polyline
        points={sparklinePoints(values, WIDTH, HEIGHT)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
