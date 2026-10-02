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
  purpose,
  aside,
  children,
}: SectionPlacement & {
  title: string;
  /** One plain sentence on what the section is for; it is also the section's description. */
  purpose: string;
  /** Shown beside the heading, e.g. a status tag. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  const purposeId = useId();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section
      id={anchor}
      aria-labelledby={headingId}
      aria-describedby={purposeId}
      className="flex scroll-mt-8 flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={headingId} className="font-serif text-xl">
          {title}
        </Heading>
        {aside}
      </div>
      <p id={purposeId} className="text-sm text-ink-muted">
        {purpose}
      </p>
      <Panel className="flex flex-col gap-3 p-4">{children}</Panel>
    </section>
  );
}
