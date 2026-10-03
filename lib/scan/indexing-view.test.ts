import { coverage, times } from "@/tests/helpers/coverage";
import { indexingState } from "./indexing-view";
import type { CollectorStatus } from "./types";
import type { CollectorRunView } from "./views";

const run = (status: CollectorStatus, error: string | null = null): CollectorRunView[] => [
  { collector: "indexing", status, error, finishedAt: new Date("2026-10-20T06:00:00Z") },
];

describe("indexingState", () => {
  it("counts the pages Google has added among those with a known status", () => {
    const observations = coverage(
      [...times(3, "indexed"), ...times(2, "crawled_not_indexed"), "unknown"],
      {
        total: 53,
      },
    );
    expect(indexingState(observations, run("ok"))).toMatchObject({
      state: "counted",
      indexed: 3,
      checked: 5,
      total: 53,
      checkedThrough: "2026-10-20T06:00:00.000Z",
    });
  });

  it.each([
    ["not_configured", "not_connected"],
    ["skipped", "no_sitemap"],
    ["failed", "failed"],
  ] as const)(
    "says why there is no count when the check is %s, keeping the reason",
    (status, why) => {
      const observations = coverage(times(5, "indexed"));
      expect(indexingState(observations, run(status, "raw reason"))).toEqual({
        state: "empty",
        why,
        reason: "raw reason",
      });
    },
  );

  it("waits when the check never ran or recorded nothing readable", () => {
    expect(indexingState([], [])).toEqual({ state: "empty", why: "waiting", reason: null });
    expect(indexingState([], run("ok"))).toEqual({ state: "empty", why: "waiting", reason: null });
  });
});
