import {
  addIsoDays,
  formatDateTime,
  formatIsoDay,
  formatLongDate,
  formatShortDateTime,
  formatWeekdayTime,
  isoDateIn,
} from "./date";

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

describe("formatIsoDay", () => {
  it("formats a calendar date (YYYY-MM-DD) in the locale, without shifting it by a zone", () => {
    expect(formatIsoDay("2026-09-01", "en-GB")).toBe("1 Sept 2026");
    expect(formatIsoDay("2026-09-01", "en-US")).toBe("Sep 1, 2026");
  });
});

describe("addIsoDays", () => {
  it("moves a calendar date across months and years", () => {
    expect(addIsoDays("2026-10-02", 1)).toBe("2026-10-03");
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIsoDays("2026-10-02", 365)).toBe("2027-10-02");
  });
});

describe("formatWeekdayTime", () => {
  it("names the weekday, day, month and time in the zone", () => {
    const at = new Date("2026-10-04T09:00:00Z"); // 20:00 in Sydney (daylight time)
    expect(formatWeekdayTime(at, "Australia/Sydney", "en-GB")).toBe("Sunday 4 Oct, 20:00");
  });
});

describe("formatShortDateTime", () => {
  it("gives the day, short month and time in the zone", () => {
    const at = new Date("2026-10-02T02:15:00Z"); // 03:15 in London (BST)
    expect(formatShortDateTime(at, "Europe/London", "en-GB")).toBe("2 Oct, 03:15");
  });
});
