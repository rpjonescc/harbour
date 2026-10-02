import type { ReactNode } from "react";

/** A labelled example on /design; the label also names the group, for assistive tech and tests. */
export function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-2xs uppercase tracking-widest text-ink-muted">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}
