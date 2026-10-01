import { getConfig } from "@/lib/config";
import { openTestDb } from "@/tests/helpers/db";
import { fetchError } from "@/tests/helpers/http-site";
import { COLLECTORS } from "./registry";
import { scoreScan } from "./score";
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
  it("runs the registered collectors and scores with formula v1", () => {
    expect(deps().collectors).toBe(COLLECTORS);
    expect(deps().scoreScan).toBe(scoreScan);
  });

  it("only lets the fetch reach configured product hosts", async () => {
    const error = await fetchError(deps().fetch("https://example.org/", { maxBytes: 64 }));
    expect(error.kind).toBe("network");
    expect(error.message).toContain("not an allowed host");
  });
});
