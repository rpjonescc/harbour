import { type ReactNode, useId } from "react";
import { Panel } from "@/components/ui/Panel";

/** One titled Settings section: a landmark named by its heading, content on a panel. */
export function SettingsSection({
  anchor,
  title,
  aside,
  children,
}: {
  /** The section's fragment id, e.g. "backups" for /settings#backups (none on /design examples). */
  anchor?: string;
  title: string;
  /** Shown beside the heading, e.g. a status tag. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section id={anchor} aria-labelledby={headingId} className="flex scroll-mt-8 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="font-serif text-xl">
          {title}
        </h2>
        {aside}
      </div>
      <Panel className="flex flex-col gap-3 p-4">{children}</Panel>
    </section>
  );
}
