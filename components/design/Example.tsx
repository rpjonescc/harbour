import type { ReactNode } from "react";

/** A labelled example on /design. */
export function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xs uppercase tracking-widest text-ink-muted">{label}</p>
      {children}
    </div>
  );
}
