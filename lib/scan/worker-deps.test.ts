import { getConfig } from "@/lib/config";
import { openTestDb } from "@/tests/helpers/db";
import { safeFetch } from "./fetch";
import { COLLECTORS, noScoring } from "./registry";
import { workerScanDeps } from "./worker-deps";

describe("workerScanDeps", () => {
  // Fails on purpose when Task 6 wires in the real scorer: update it then.
  it("runs the registered collectors with the safe fetch and the stand-in scorer", () => {
    const deps = workerScanDeps({
      db: openTestDb(),
      config: getConfig(),
      products: [],
      now: () => new Date(),
      stopping: () => false,
    });
    expect(deps.collectors).toBe(COLLECTORS);
    expect(deps.fetch).toBe(safeFetch);
    expect(deps.scoreScan).toBe(noScoring);
  });
});
