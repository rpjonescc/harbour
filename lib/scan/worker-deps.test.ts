import { getConfig } from "@/lib/config";
import { openTestDb } from "@/tests/helpers/db";
import { fetchError } from "@/tests/helpers/http-site";
import { COLLECTORS, noScoring } from "./registry";
import { workerScanDeps } from "./worker-deps";

const deps = () =>
  workerScanDeps({
    db: openTestDb(),
    config: getConfig(),
    products: [{ id: "acme", name: "Acme Docs", url: "https://example.com/", hue: "teal" }],
    now: () => new Date(),
    stopping: () => false,
  });

describe("workerScanDeps", () => {
  // Fails on purpose when Task 6 wires in the real scorer: update it then.
  it("runs the registered collectors with the stand-in scorer", () => {
    expect(deps().collectors).toBe(COLLECTORS);
    expect(deps().scoreScan).toBe(noScoring);
  });

  it("registers the crawler first: later collectors read its pages", () => {
    expect(COLLECTORS.map((collector) => collector.id)).toEqual(["crawler"]);
  });

  it("only lets the fetch reach configured product hosts", async () => {
    const error = await fetchError(deps().fetch("https://example.org/", { maxBytes: 64 }));
    expect(error.kind).toBe("network");
    expect(error.message).toContain("not an allowed host");
  });
});
