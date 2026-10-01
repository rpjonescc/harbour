import { getConfig } from "@/lib/config";
import { openTestDb } from "@/tests/helpers/db";
import { COLLECTORS, noScoring, unavailableFetch } from "./registry";
import { workerScanDeps } from "./worker-deps";

describe("workerScanDeps", () => {
  // Fails on purpose when Task 2 / Task 6 wire in the real fetch and scorer: update it then.
  it("runs the registered collectors with the stand-in fetch and scorer", () => {
    const deps = workerScanDeps({
      db: openTestDb(),
      config: getConfig(),
      products: [],
      now: () => new Date(),
      stopping: () => false,
    });
    expect(deps.collectors).toBe(COLLECTORS);
    expect(deps.fetch).toBe(unavailableFetch);
    expect(deps.scoreScan).toBe(noScoring);
  });
});
