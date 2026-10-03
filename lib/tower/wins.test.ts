import { LONDON, PRODUCTS } from "@/tests/helpers/tower";
import { weekWins } from "./wins";
import type { WinsFacts } from "./wins-data";

const days = [
  "2026-09-26",
  "2026-09-27",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
];
const quiet: WinsFacts = {
  doneByDay: days.map((day) => ({ day, count: 0, withPr: 0 })),
  rises: [],
  indexedGain: [],
  approvedPieces: null,
};
const wins = (over: Partial<WinsFacts>) =>
  weekWins({ ...quiet, ...over }, PRODUCTS, LONDON, "en-GB");

describe("weekWins", () => {
  it("says a quiet week kindly only when there is nothing to list", () => {
    expect(wins({})).toMatchObject({
      lines: [],
      quiet: "A quiet week so far. Small steps still count: the next one is on the Board.",
    });
    expect(wins({ approvedPieces: 0 }).quiet).not.toBeNull();
    expect(wins({ approvedPieces: 1 }).quiet).toBeNull();
  });

  it("labels seven bars with the owner's weekdays, oldest first", () => {
    const doneByDay = days.map((day, i) => ({ day, count: i, withPr: 0 }));
    expect(wins({ doneByDay }).bars).toEqual([
      { day: "2026-09-26", label: "Sat", count: 0 },
      { day: "2026-09-27", label: "Sun", count: 1 },
      { day: "2026-09-28", label: "Mon", count: 2 },
      { day: "2026-09-29", label: "Tue", count: 3 },
      { day: "2026-09-30", label: "Wed", count: 4 },
      { day: "2026-10-01", label: "Thu", count: 5 },
      { day: "2026-10-02", label: "Fri", count: 6 },
    ]);
  });

  it("counts the cards finished and those with a pull request", () => {
    const doneByDay = days.map((day, i) => ({
      day,
      count: i === 6 ? 3 : i === 2 ? 1 : 0,
      withPr: i === 6 ? 2 : 0,
    }));
    expect(wins({ doneByDay }).lines).toEqual([
      "4 cards finished this week, 2 with a pull request merged.",
    ]);
    const one = days.map((day, i) => ({ day, count: i === 0 ? 1 : 0, withPr: 0 }));
    expect(wins({ doneByDay: one }).lines).toEqual(["1 card finished this week."]);
  });

  it("says a rise within a band as a number, and across bands in verdict words", () => {
    expect(
      wins({
        rises: [
          { productId: "acme-docs", area: "seo", from: 52, to: 58 },
          { productId: "acme-blog", area: "aeo", from: 65, to: 72 },
        ],
      }).lines,
    ).toEqual([
      "Acme Docs: Found on Google up 6.",
      "Acme Blog: Answer-ready went from Fair to Good.",
    ]);
  });

  it("lists pages newly in Google and approved pieces, capped at five lines", () => {
    const rises = Array.from({ length: 4 }, () => ({
      productId: "acme-docs",
      area: "geo" as const,
      from: 10,
      to: 12,
    }));
    const result = wins({
      rises,
      indexedGain: [{ productId: "acme-blog", from: 3, to: 7 }],
      approvedPieces: 2,
    });
    expect(result.lines).toHaveLength(5);
    expect(result.lines.at(-1)).toBe("Acme Blog: 4 more pages in Google.");
    expect(wins({ approvedPieces: 2 }).lines).toEqual(["2 content pieces approved this week."]);
  });
});
