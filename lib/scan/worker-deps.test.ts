import { type Config, getConfig, parseConfig } from "@/lib/config";
import { openTestDb } from "@/tests/helpers/db";
import { closeSites, fetchError, site, text } from "@/tests/helpers/http-site";
import { COLLECTORS } from "./registry";
import { scoreScan } from "./score";
import { workerScanDeps } from "./worker-deps";

const deps = (config: Config = getConfig(), url = "https://example.com/") =>
  workerScanDeps({
    db: openTestDb(),
    config,
    products: [{ id: "acme", name: "Acme Docs", url, hue: "teal", kind: "product" as const }],
    now: () => new Date(),
    stopping: () => false,
  });

/** The E2E environment's settings: a loopback origin, test mode and loopback scans on. */
const e2eConfig = () =>
  parseConfig({
    ...process.env,
    HARBOUR_ORIGIN: "http://localhost:3401",
    HARBOUR_RP_ID: "localhost",
    HARBOUR_TEST_MODE: "1",
    HARBOUR_SCAN_ALLOW_LOOPBACK: "1",
  });

afterEach(closeSites);

describe("workerScanDeps", () => {
  it("runs the registered collectors and scores with formula v2", () => {
    expect(deps().collectors).toBe(COLLECTORS);
    expect(deps().scoreScan).toBe(scoreScan);
  });

  it("caps paid calls at the monthly budget, in micro-AUD and the configured zone", () => {
    const config = parseConfig({
      ...process.env,
      HARBOUR_MONTHLY_BUDGET_AUD: "60.5",
      HARBOUR_TIMEZONE: "Australia/Sydney",
    });
    expect(deps(config).budget).toEqual({ capMicroAud: 60_500_000, timeZone: "Australia/Sydney" });
    expect(
      deps(parseConfig({ ...process.env, HARBOUR_MONTHLY_BUDGET_AUD: undefined })).budget,
    ).toEqual(expect.objectContaining({ capMicroAud: 0 }));
  });

  it("only lets the fetch reach configured product hosts", async () => {
    const error = await fetchError(deps().fetch("https://example.org/", { maxBytes: 64 }));
    expect(error.kind).toBe("network");
    expect(error.message).toContain("not an allowed host");
  });

  it("refuses a loopback product site by default", async () => {
    const local = await site({ "/robots.txt": text(""), "/": text("home") });
    const error = await fetchError(
      deps(getConfig(), `${local.origin}/`).fetch(`${local.origin}/`, { maxBytes: 64 }),
    );
    expect(error.message).toContain("Refused non-public host");
    expect(local.hits).toEqual([]);
  });

  it("reaches a loopback product site when the test-only setting allows it", async () => {
    const local = await site({ "/robots.txt": text(""), "/": text("home") });
    const fetch = deps(e2eConfig(), `${local.origin}/`).fetch;
    const response = await fetch(`${local.origin}/`, { maxBytes: 64 });
    expect(response.body).toBe("home");
  });
});
