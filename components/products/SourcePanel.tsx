import type { ReactNode } from "react";
import { Tag } from "@/components/ui/Tag";

export type SourceStatus = "connected" | "not-connected" | "failed";

const TONE = { connected: "accent", "not-connected": "neutral", failed: "warn" } as const;

/** A data source's panel: heading, connection state and what it shows (or how to connect it). */
export function SourcePanel({
  id,
  title,
  status,
  statusLabel,
  children,
}: {
  id: string;
  title: string;
  status: SourceStatus;
  /** The tag text; `status` only picks its tone. */
  statusLabel: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="font-serif text-lg">
          {title}
        </h2>
        <Tag tone={TONE[status]}>{statusLabel}</Tag>
      </div>
      {children}
    </section>
  );
}
