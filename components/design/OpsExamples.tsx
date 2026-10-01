import { CostMeter } from "@/components/today/CostMeter";
import { MICRO_PER_AUD } from "@/lib/costs/budget";
import type { CostMeterView } from "@/lib/costs/meter-view";

const A$ = (aud: number) => Math.round(aud * MICRO_PER_AUD);
const ZONE = { now: new Date("2026-10-16T09:00:00Z"), timeZone: "Europe/London", locale: "en-GB" };

const METERS: { label: string; view: CostMeterView }[] = [
  {
    label: "No paid sources",
    view: { state: "no-paid-sources", spentMicro: 0, unconfirmedMicro: 0 },
  },
  {
    label: "Disconnected, with spend",
    view: { state: "no-paid-sources", spentMicro: A$(1.23), unconfirmedMicro: 0 },
  },
  { label: "No budget", view: { state: "no-budget", spentMicro: 0, unconfirmedMicro: 0 } },
  {
    label: "On track",
    view: {
      state: "ok",
      spentMicro: A$(12.4),
      capMicro: A$(60),
      projectedMicro: A$(31),
      unconfirmedMicro: 0,
    },
  },
  {
    label: "80 % warning",
    view: {
      state: "warn",
      spentMicro: A$(49.5),
      capMicro: A$(60),
      projectedMicro: A$(95.9),
      unconfirmedMicro: 0,
    },
  },
  {
    label: "With unconfirmed spend",
    view: {
      state: "ok",
      spentMicro: A$(20.5),
      capMicro: A$(60),
      projectedMicro: A$(42),
      unconfirmedMicro: A$(0.5),
    },
  },
  {
    label: "Budget reached",
    view: {
      state: "reached",
      spentMicro: A$(60.12),
      capMicro: A$(60),
      projectedMicro: A$(116),
      unconfirmedMicro: 0,
    },
  },
];

/** Fictional operations pieces: Today's cost meter in each state. */
export function OpsExamples() {
  return (
    <div className="flex flex-col gap-4">
      {METERS.map(({ label, view }) => (
        <div key={label} className="flex flex-col gap-1">
          <p className="text-2xs uppercase tracking-widest text-ink-muted">{label}</p>
          <CostMeter view={view} {...ZONE} />
        </div>
      ))}
    </div>
  );
}
