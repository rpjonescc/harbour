import { type ReactNode, useId } from "react";
import { Panel } from "@/components/ui/Panel";

/** Where a Settings section sits: its fragment id on /settings, its heading level on /design. */
export type SectionPlacement = {
  /** The section's fragment id, e.g. "backups" for /settings#backups (none on /design examples). */
  anchor?: string;
  /** 2 on /settings; 3 when nested under another section's heading (the /design examples). */
  level?: 2 | 3;
};

/** One titled Settings section: a landmark named by its heading, content on a panel. */
export function SettingsSection({
  anchor,
  level = 2,
  title,
  aside,
  children,
}: SectionPlacement & {
  title: string;
  /** Shown beside the heading, e.g. a status tag. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section id={anchor} aria-labelledby={headingId} className="flex scroll-mt-8 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={headingId} className="font-serif text-xl">
          {title}
        </Heading>
        {aside}
      </div>
      <Panel className="flex flex-col gap-3 p-4">{children}</Panel>
    </section>
  );
}
