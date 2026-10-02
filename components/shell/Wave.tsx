import type { CSSProperties } from "react";
import { WAVE_HEIGHT, WAVE_LAYERS, WAVE_WIDTH, wavePath } from "@/design/wave";

const PLACEMENT = {
  // Behind everything in the signed-in shell, along the lower half of the viewport.
  page: "fixed inset-x-0 bottom-0 h-1/2",
  // Inside a box (the /design example).
  preview: "absolute inset-0",
} as const;

/**
 * The calm wave (spec §5): two or three faint layers of inline SVG drifting at different speeds.
 * Decorative only: no script, hidden from assistive tech, never takes a click, coloured with the
 * tide tint token. The drift and the celebrate ripple are CSS (app/globals.css) and switch off
 * under prefers-reduced-motion. Nothing here pauses it in a hidden tab: that relies on the
 * browser, which does not run CSS animations in a background tab.
 */
export function Wave({ placement = "page" }: { placement?: keyof typeof PLACEMENT }) {
  return (
    <div
      aria-hidden="true"
      data-wave=""
      className={`pointer-events-none z-0 overflow-hidden ${PLACEMENT[placement]}`}
    >
      {WAVE_LAYERS.map((layer, index) => (
        <div
          key={layer.id}
          className="wave-layer"
          data-front={index === WAVE_LAYERS.length - 1 ? "" : undefined}
          style={{ height: `${layer.heightPct}%` }}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            className="wave-drift"
            viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}
            preserveAspectRatio="none"
            style={{ "--wave-seconds": `${layer.seconds}s` } as CSSProperties}
          >
            <path d={wavePath(layer)} className="fill-accent-soft" fillOpacity={layer.opacity} />
          </svg>
        </div>
      ))}
    </div>
  );
}
