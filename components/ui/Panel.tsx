import type { ReactNode } from "react";

/** Raised surface with a hairline border. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-line bg-surface ${className}`}>{children}</div>;
}
