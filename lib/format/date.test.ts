import { formatDateTime, formatLongDate, isoDateIn } from "./date";

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

describe("isoDateIn", () => {
  it("gives the calendar date in the zone", () => {
    expect(isoDateIn("Pacific/Honolulu", new Date("2026-10-02T05:00:00Z"))).toBe("2026-10-01");
  });
});

describe("formatDateTime", () => {
  it("includes date and time in the zone and locale", () => {
    const text = formatDateTime(new Date("2026-10-01T20:30:00Z"), "Pacific/Honolulu", "en-GB");
    expect(text).toMatch(/1 Oct 2026/);
    expect(text).toMatch(/10:30/);
  });
});
