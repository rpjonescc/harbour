import { fake, ok, page, returns, setup, throws } from "@/tests/helpers/scan-run";
import type { CollectContext, CollectorStatus, Observation } from "./types";

type Seen = { status: CollectorStatus | undefined; observations: Observation[] };

/** A collector that records what it sees of `ids` from earlier in the scan. */
function reader(ids: string[]) {
  const seen: Record<string, Seen>[] = [];
  const collector = fake("readiness", async (ctx: CollectContext) => {
    const view: Record<string, Seen> = {};
    for (const id of ids) {
      view[id] = { status: ctx.earlier.status(id), observations: ctx.earlier.observations(id) };
    }
    seen.push(view);
    return { status: "ok", observations: [] };
  });
  return { collector, seen };
}

describe("runScan earlier results", () => {
  it("shows a collector what earlier collectors in the scan ended with and stored", async () => {
    const { collector, seen } = reader(["crawler", "skipper", "pagespeed"]);
    const { scan } = setup([
      ok("crawler", 2),
      returns("skipper", { status: "skipped", reason: "not today" }),
      collector,
      ok("pagespeed"),
    ]);
    await scan();
    expect(seen).toEqual([
      {
        crawler: { status: "ok", observations: [page("/0"), page("/1")] },
        skipper: { status: "skipped", observations: [] },
        pagespeed: { status: undefined, observations: [] },
      },
    ]);
  });

  it("shows only this scan's results, so a failed run hides last scan's pages", async () => {
    const { collector, seen } = reader(["crawler"]);
    const first = setup([ok("crawler", 1), collector]);
    await first.scan();
    first.deps.collectors = [throws("crawler"), collector];
    await first.scan();
    expect(seen[1]).toEqual({ crawler: { status: "failed", observations: [] } });
  });
});
