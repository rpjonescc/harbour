import type { ReactNode } from "react";

type Tone = "accent" | "good" | "warn" | "neutral";

const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  good: "bg-surface-sunk text-good",
  warn: "bg-warn-soft text-ink",
  neutral: "bg-surface-sunk text-ink-muted",
};

/** Small rounded label. */
export function Tag({ tone = "accent", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-2xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
