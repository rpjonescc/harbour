import type { CSSProperties } from "react";
import { WAVE_HEIGHT, WAVE_LAYERS, WAVE_WIDTH, wavePath } from "@/design/wave";

const PLACEMENT = {
  // Behind everything on every page (the root layout), along the lower half of the viewport.
  page: "fixed inset-x-0 bottom-0 h-1/2",
  // Inside a box (the /design example).
  preview: "absolute inset-0",
} as const;

/**
 * The ocean background: a soft fade to the horizon and three layers of inline SVG water drifting
 * and bobbing at different speeds. Decorative only: no script, hidden from assistive tech, never
 * takes a click, painted with the ocean tokens. The motion is CSS (app/globals.css): it stops
 * under prefers-reduced-motion, browsers do not run it in a hidden tab, and print hides it.
 */
export function Wave({ placement = "page" }: { placement?: keyof typeof PLACEMENT }) {
  return (
    <div
      aria-hidden="true"
      data-wave=""
      className={`pointer-events-none z-0 overflow-hidden ${PLACEMENT[placement]}`}
    >
      <div className="wave-sky" />
      {WAVE_LAYERS.map((layer, index) => (
        <div
          key={layer.id}
          className="wave-layer"
          data-front={index === WAVE_LAYERS.length - 1 ? "" : undefined}
          style={
            {
              height: `${layer.heightPct}%`,
              "--bob-seconds": `${layer.bobSeconds}s`,
              "--bob-delay": `${-layer.phase * layer.bobSeconds * 2}s`,
            } as CSSProperties
          }
        >
          <svg
            aria-hidden="true"
            focusable="false"
            className="wave-drift"
            viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}
            preserveAspectRatio="none"
            style={
              {
                "--wave-seconds": `${layer.seconds}s`,
                "--wave-delay": `${-layer.phase * layer.seconds}s`,
              } as CSSProperties
            }
          >
            <path d={wavePath(layer)} style={{ fill: `var(--${layer.token})` }} />
          </svg>
        </div>
      ))}
    </div>
  );
}
