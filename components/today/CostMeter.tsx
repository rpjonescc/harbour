import { DocsLink } from "@/components/ui/DocsLink";
import { Tag } from "@/components/ui/Tag";
import { formatAud, MICRO_PER_AUD } from "@/lib/costs/budget";
import type { CostMeterView } from "@/lib/costs/meter-view";
import { DOCS_LINKS } from "@/lib/docs-links";
import { monthWindow } from "@/lib/format/zoned-time";

type Props = { view: CostMeterView; now: Date; timeZone: string; locale: string };
type Capped = Extract<CostMeterView, { capMicro: number }>;

// The native bar's colours are browser defaults: restyle its parts with our tokens.
const TRACK =
  "h-1.5 w-full max-w-xs appearance-none overflow-hidden rounded-full border-0 bg-surface-sunk " +
  "[&::-webkit-meter-bar]:h-1.5 [&::-webkit-meter-bar]:border-0 [&::-webkit-meter-bar]:bg-surface-sunk";
const FILL = {
  accent:
    "[&::-moz-meter-bar]:bg-accent [&::-webkit-meter-optimum-value]:bg-accent " +
    "[&::-webkit-meter-suboptimum-value]:bg-accent [&::-webkit-meter-even-less-good-value]:bg-accent",
  warn:
    "[&::-moz-meter-bar]:bg-warn [&::-webkit-meter-optimum-value]:bg-warn " +
    "[&::-webkit-meter-suboptimum-value]:bg-warn [&::-webkit-meter-even-less-good-value]:bg-warn",
};

/** Spend against the cap as a token-coloured native meter (values in AUD). */
function SpendBar({ view, label }: { view: Capped; label: string }) {
  const shown = Math.min(view.spentMicro, view.capMicro);
  return (
    <meter
      aria-label="Paid API spend this month"
      aria-valuetext={label}
      className={`${TRACK} ${FILL[view.state === "ok" ? "accent" : "warn"]}`}
      min={0}
      max={view.capMicro / MICRO_PER_AUD}
      value={shown / MICRO_PER_AUD}
    />
  );
}

/** Today's line on paid API spend this month: sources, budget, projection and pause. */
export function CostMeter({ view, now, timeZone, locale }: Props) {
  const aud = (micro: number) => formatAud(micro, locale);
  const unconfirmed =
    view.unconfirmedMicro > 0 ? ` · ${aud(view.unconfirmedMicro)} unconfirmed` : "";
  if (view.state === "no-paid-sources") {
    return (
      <p className="text-sm text-ink-muted">
        No paid sources connected
        {view.spentMicro > 0 && ` · ${aud(view.spentMicro)} spent this month${unconfirmed}`}
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
  const amounts = `${aud(view.spentMicro)} of ${aud(view.capMicro)}`;
  const projection =
    view.projectedMicro === null ? "" : ` · on track for ${aud(view.projectedMicro)}`;
  const resumes = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" });
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="flex flex-wrap items-center gap-2 text-ink-muted">
        <span>
          {amounts} this month{projection}
          {unconfirmed}
        </span>
        {view.state === "warn" && <Tag tone="warn">80 % of budget</Tag>}
      </p>
      <SpendBar view={view} label={amounts} />
      {view.state === "reached" && (
        <p role="status" className="text-ink">
          Budget reached — paid sources are paused until{" "}
          {resumes.format(monthWindow(now, timeZone).end)}
        </p>
      )}
    </div>
  );
}
