import { TechnicalDetails } from "@/components/explain/TechnicalDetails";
import { DocsLink } from "@/components/ui/DocsLink";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { DOCS_LINKS } from "@/lib/docs-links";

/** Whether the worker queues the daily 06:00 checks by itself. */
export function ScheduleCard({ enabled, timeZone }: { enabled: boolean; timeZone: string }) {
  return (
    <Panel className="flex flex-col gap-1 p-4">
      <h2 className="flex items-center gap-2 font-serif text-lg">
        Daily check <Tag tone={enabled ? "accent" : "neutral"}>{enabled ? "On" : "Off"}</Tag>
      </h2>
      <p className="text-sm text-ink-muted">
        {enabled
          ? `Harbour checks every site at 06:00 (${timeZone}), and catches up when it starts.`
          : "Daily checks are off, so Harbour only checks when you choose Check now."}{" "}
        <DocsLink href={DOCS_LINKS.schedule}>When checks run</DocsLink>
      </p>
      {!enabled && (
        <TechnicalDetails id="daily-check-setting" topic="how to turn daily checks back on">
          <p>
            Remove <code className="font-mono">HARBOUR_SCHEDULED_SCANS=off</code> from{" "}
            <code className="font-mono">.env</code>, then restart the worker.
          </p>
        </TechnicalDetails>
      )}
    </Panel>
  );
}
