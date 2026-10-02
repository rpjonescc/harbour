import { Wave } from "@/components/shell/Wave";

/** The wave in a box with text in every colour the page uses over it, to judge by eye. */
export function WaveExample() {
  return (
    <div className="relative h-56 overflow-hidden rounded-md border border-line bg-bg">
      <Wave placement="preview" />
      <div className="relative z-10 flex flex-col gap-1 p-4">
        <p className="font-serif text-xl">Calm water, steady text</p>
        <p className="text-sm">Body text over the wave.</p>
        <p className="text-sm text-ink-muted">Muted text over the wave.</p>
        <p className="text-sm text-accent">An accent link over the wave.</p>
        <p className="text-sm">
          <span className="text-good">good</span>, <span className="text-warn">needs a look</span>,{" "}
          <span className="text-bad">failed</span>: signal colours over the wave.
        </p>
        <p className="text-xs text-ink-muted">
          Contrast is checked by design/wave-contrast.test.ts; motion stops under reduced motion.
        </p>
      </div>
    </div>
  );
}
