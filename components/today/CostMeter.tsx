import { DocsLink } from "@/components/ui/DocsLink";
import { Tag } from "@/components/ui/Tag";
import { formatAud } from "@/lib/costs/budget";
import type { CostMeterView } from "@/lib/costs/meter-view";
import { DOCS_LINKS } from "@/lib/docs-links";
import { monthWindow } from "@/lib/format/zoned-time";

type Props = { view: CostMeterView; now: Date; timeZone: string; locale: string };

/** Today's line on paid API spend this month: sources, budget, projection and pause. */
export function CostMeter({ view, now, timeZone, locale }: Props) {
  const aud = (micro: number) => formatAud(micro, locale);
  if (view.state === "no-paid-sources") {
    return (
      <p className="text-sm text-ink-muted">
        No paid sources connected
        {view.spentMicro > 0 && <> · {aud(view.spentMicro)} spent this month</>}
      </p>
    );
  }
  if (view.state === "no-budget") {
    return (
      <p className="text-sm text-ink-muted">
        Paid sources are off: <DocsLink href={DOCS_LINKS.costs}>no monthly budget set</DocsLink>
      </p>
    );
  }
  const projection =
    view.projectedMicro === null ? "" : ` · on track for ${aud(view.projectedMicro)}`;
  const resumes = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" });
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="flex flex-wrap items-center gap-2 text-ink-muted">
        <span>
          {aud(view.spentMicro)} of {aud(view.capMicro)} this month{projection}
        </span>
        {view.state === "warn" && <Tag tone="warn">80 % of budget</Tag>}
      </p>
      <meter
        aria-label="Paid API spend this month"
        className="h-1.5 w-full max-w-xs accent-accent"
        min={0}
        max={view.capMicro}
        high={Math.floor((view.capMicro * 4) / 5)}
        optimum={0}
        value={Math.min(view.spentMicro, view.capMicro)}
      />
      {view.state === "reached" && (
        <p role="status" className="text-ink">
          Budget reached — paid sources are paused until{" "}
          {resumes.format(monthWindow(now, timeZone).end)}
        </p>
      )}
    </div>
  );
}
