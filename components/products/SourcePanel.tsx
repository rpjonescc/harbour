import type { ReactNode } from "react";
import { Tag } from "@/components/ui/Tag";

export type SourceStatus = "connected" | "not-connected" | "failed";

const TAG = {
  connected: { tone: "accent", text: "Connected" },
  "not-connected": { tone: "neutral", text: "Not connected" },
  failed: { tone: "warn", text: "Failed" },
} as const;

/** A data source's panel: heading, connection state and what it shows (or how to connect it). */
export function SourcePanel({
  id,
  title,
  status,
  children,
}: {
  id: string;
  title: string;
  status: SourceStatus;
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
        <Tag tone={TAG[status].tone}>{TAG[status].text}</Tag>
      </div>
      {children}
    </section>
  );
}
