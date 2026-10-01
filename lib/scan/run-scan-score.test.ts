import { scores } from "@/lib/db/schema";
import { DAY, ok, returns, setup, t0 } from "@/tests/helpers/scan-run";
import { ACME_CRAWL, cwv, readiness } from "@/tests/helpers/scoring";
import { scoreScan } from "./score";
import type { Observation, ScoreContext, ScoreScan } from "./types";

const strip = ({ collector: _, ...observation }: Observation & { collector: string }) =>
  observation;

/** A fake scorer that records the context it was given. */
function recordingScorer() {
  const contexts: ScoreContext[] = [];
  const scorer: ScoreScan = (_observations, _statuses, context) => {
    contexts.push(context);
    return null;
  };
  return { scorer, contexts };
}

describe("runScan scoring", () => {
  it("scores with the scan's time and no carried-over PageSpeed when PageSpeed ran", async () => {
    const { scorer, contexts } = recordingScorer();
    const { scan } = setup([ok("crawler"), ok("pagespeed", 1, "weekly")], { scoreScan: scorer });
    await scan();
    expect(contexts).toEqual([{ now: t0, previousPagespeed: null }]);
  });

  it("hands the scorer PageSpeed's last ok result when this scan skipped it", async () => {
    const { scorer, contexts } = recordingScorer();
    const measured = strip(cwv());
    const pagespeed = returns("pagespeed", { status: "ok", observations: [measured] }, "weekly");
    const { scan, advance } = setup([ok("crawler"), pagespeed], { scoreScan: scorer });
    await scan();
    advance(2 * DAY);
    await scan();
    expect(pagespeed.calls).toBe(1);
    expect(contexts[1]).toEqual({
      now: new Date(t0.getTime() + 2 * DAY),
      previousPagespeed: { observations: [measured], finishedAt: t0 },
    });
  });

  it("stores a v1 score row from the real scorer", async () => {
    const crawler = returns("crawler", { status: "ok", observations: ACME_CRAWL.map(strip) });
    const ready = returns("readiness", { status: "ok", observations: [strip(readiness())] });
    const { db, scan } = setup([crawler, ready], { scoreScan });
    await scan();
    expect(db.select().from(scores).all()).toEqual([
      expect.objectContaining({
        formulaVersion: "v1",
        seo: 83,
        geo: 91,
        aeo: 88,
        complete: { seo: false, geo: true, aeo: true },
      }),
    ]);
  });
});
