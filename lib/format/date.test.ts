import { formatLongDate } from "./date";

// 05:00 UTC on 1 Oct is still 19:00 on 30 Sep in Honolulu (UTC-10, no DST).
const instant = new Date("2026-10-01T05:00:00Z");

describe("formatLongDate", () => {
  it("formats in the configured timezone, not UTC", () => {
    expect(formatLongDate(instant, "Pacific/Honolulu", "en-GB")).toBe("Wednesday 30 September");
    expect(formatLongDate(instant, "UTC", "en-GB")).toBe("Thursday 1 October");
  });

  it("orders day and month per locale without a comma", () => {
    expect(formatLongDate(instant, "UTC", "en-US")).toBe("Thursday October 1");
    expect(formatLongDate(instant, "UTC", "en-GB")).toBe("Thursday 1 October");
  });
});
