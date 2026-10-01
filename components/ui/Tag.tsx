import type { ReactNode } from "react";

type Tone = "accent" | "warn" | "neutral";

const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
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
