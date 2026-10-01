import { DocsLink } from "@/components/ui/DocsLink";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";

/** Whether the worker queues the daily 06:00 scans by itself. */
export function ScheduleCard({ enabled, timeZone }: { enabled: boolean; timeZone: string }) {
  return (
    <Panel className="p-4">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-lg">
          Daily scan <Tag tone={enabled ? "accent" : "neutral"}>{enabled ? "On" : "Off"}</Tag>
        </h2>
        <p className="text-sm text-ink-muted">
          {enabled
            ? `Every product at 06:00 (${timeZone}), plus a catch-up when the worker starts.`
            : "Off (HARBOUR_SCHEDULED_SCANS=off): scans run only when you choose Scan now."}{" "}
          <DocsLink href={DOCS_LINKS.schedule}>When scans run</DocsLink>
        </p>
      </div>
    </Panel>
  );
}
