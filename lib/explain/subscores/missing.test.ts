import {
  ACME_SCAN,
  ALL_OK,
  cwv,
  daysOf,
  entryOf,
  NOW,
  scoreOf,
  searchConsole,
} from "@/tests/helpers/scoring";
import { missingLine } from "./missing";

const DAY_MS = 24 * 60 * 60_000;
const without = (collector: string) => ACME_SCAN.filter((o) => o.collector !== collector);
const lineFor = (result: ReturnType<typeof scoreOf>, key: string) =>
  missingLine(entryOf(result, key)?.evidence ?? "");

describe("missingLine", () => {
  it("reads the real scorer's reasons for sources that are not connected or failed", () => {
    const result = scoreOf(
      without("pagespeed").filter((o) => o.collector !== "search-console"),
      { ...ALL_OK, pagespeed: "not_configured", "search-console": "failed" },
    );
    expect(lineFor(result, "seo.cwv")).toBe("Not connected yet, so it isn't counted.");
    expect(lineFor(result, "seo.searchTrend")).toBe(
      "The data didn't arrive in the last check, so it isn't counted for now.",
    );
    expect(lineFor(result, "geo.aiEngines")).toBe(
      "Measured in How the web sees you, not counted in the score yet.",
    );
    expect(lineFor(result, "aeo.snippets")).toBe(
      "Needs paid data, which isn't connected yet, so it isn't counted.",
    );
  });

  it("says speed data is still arriving when PageSpeed was skipped with no earlier result", () => {
    const result = scoreOf(without("pagespeed"), { ...ALL_OK, pagespeed: "skipped" });
    expect(lineFor(result, "seo.cwv")).toBe(
      "Speed data is still arriving, so it isn't counted yet.",
    );
  });

  it("says the last speed test is too old when the carried-over one is", () => {
    const result = scoreOf(
      without("pagespeed"),
      { ...ALL_OK, pagespeed: "skipped" },
      {
        now: NOW,
        productKind: "product" as const,
        previousPagespeed: {
          observations: [cwv()],
          finishedAt: new Date(NOW.getTime() - 15 * DAY_MS),
        },
      },
    );
    expect(lineFor(result, "seo.cwv")).toBe(
      "The last speed test is more than two weeks old, so it isn't counted until the next one.",
    );
  });

  it("says there isn't enough history for a trend", () => {
    const scan = [...without("search-console"), ...searchConsole(daysOf(28, 5), daysOf(28, 1))];
    expect(lineFor(scoreOf(scan), "seo.searchTrend")).toBe(
      "There isn't enough search history yet to see a trend.",
    );
  });

  it("falls back to a plain sentence for a reason it doesn't know", () => {
    expect(missingLine("Readiness data has an unexpected shape (robotsTxt: Required)")).toBe(
      "Harbour couldn't measure this in the last check, so it isn't counted.",
    );
  });
});
