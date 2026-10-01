import type { ReactNode } from "react";

/** A link to Harbour's documentation, opened in a new tab (announced to screen readers). */
export function DocsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
