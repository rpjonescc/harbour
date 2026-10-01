/** A paid collector for tests only: prices calls, asks the budget and records costs, offline. */
import type { Collector, CollectorResult } from "@/lib/scan/types";

export type FakePaidCollector = Collector & { calls: number };

/**
 * `calls` paid calls at `pricePerCallMicro` each, the way a real paid collector must make them:
 * ask `ctx.budget.allow` before each call, record its cost after. Never touches the network.
 */
export function fakePaidCollector({
  id = "rankings",
  pricePerCallMicro,
  calls,
}: {
  id?: string;
  pricePerCallMicro: number;
  calls: number;
}): FakePaidCollector {
  const collector: FakePaidCollector = {
    id,
    cadence: "daily",
    paid: true,
    calls: 0,
    collect: async (ctx): Promise<CollectorResult> => {
      const observations = [];
      for (let i = 0; i < calls; i += 1) {
        if (!ctx.budget.allow(pricePerCallMicro)) {
          return { status: "skipped", reason: `budget: monthly budget reached after ${i} calls` };
        }
        collector.calls += 1;
        ctx.cost.record({ provider: "dataforseo", units: 1, amountMicroAud: pricePerCallMicro });
        observations.push({ kind: "ranking", subject: `keyword ${i}`, value: { position: i + 1 } });
      }
      return { status: "ok", observations };
    },
  };
  return collector;
}
