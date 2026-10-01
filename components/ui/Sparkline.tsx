import { sparklinePoints } from "./sparkline-points";

/** Tiny trend line; `label` describes the trend for screen readers. */
export function Sparkline({
  values,
  label,
  width = 60,
  height = 18,
}: {
  values: number[];
  label: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        points={sparklinePoints(values, width, height)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
