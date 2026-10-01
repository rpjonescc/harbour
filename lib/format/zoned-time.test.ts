import {
  addDays,
  latestDailySlotDay,
  latestMonthlySlot,
  monthWindow,
  nextDailySlot,
  nextMonthlySlot,
  zonedInstant,
} from "./zoned-time";

const LONDON = "Europe/London"; // BST (UTC+1) until 25 October 2026
const HELSINKI = "Europe/Helsinki"; // 03:00 → 04:00 on 29 March, 04:00 → 03:00 on 25 October 2026
const SYDNEY = "Australia/Sydney"; // 02:00 AEST → 03:00 AEDT on 4 October 2026
const SLOT = 3 * 60 + 15;

describe("addDays", () => {
  it("moves across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("rejects a malformed day", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow("Invalid date");
  });
});

describe("latestDailySlotDay", () => {
  it("is yesterday before 03:15 local and today from 03:15", () => {
    expect(latestDailySlotDay(new Date("2026-10-02T02:14:00Z"), LONDON, SLOT)).toBe("2026-10-01");
    expect(latestDailySlotDay(new Date("2026-10-02T02:15:00Z"), LONDON, SLOT)).toBe("2026-10-02");
    expect(latestDailySlotDay(new Date("2026-10-02T22:59:00Z"), LONDON, SLOT)).toBe("2026-10-02");
  });
});

describe("nextDailySlot", () => {
  it("is later today before the slot", () => {
    expect(nextDailySlot(new Date("2026-10-02T01:00:00Z"), LONDON, SLOT)).toEqual(
      new Date("2026-10-02T02:15:00Z"),
    );
  });

  it("is tomorrow at and after the slot, across midnight", () => {
    expect(nextDailySlot(new Date("2026-10-02T02:15:00Z"), LONDON, SLOT)).toEqual(
      new Date("2026-10-03T02:15:00Z"),
    );
    expect(nextDailySlot(new Date("2026-10-02T23:30:00Z"), LONDON, SLOT)).toEqual(
      new Date("2026-10-03T02:15:00Z"),
    );
  });

  it("follows a clock change between today and tomorrow", () => {
    // 03:15 BST on 24 October, then 03:15 GMT on 25 October.
    expect(nextDailySlot(new Date("2026-10-24T12:00:00Z"), LONDON, SLOT)).toEqual(
      new Date("2026-10-25T03:15:00Z"),
    );
  });
});

describe("zonedInstant", () => {
  it("moves a time in the spring-forward gap past the gap (03:15 → 04:15)", () => {
    expect(zonedInstant("2026-03-29", SLOT, HELSINKI)).toEqual(new Date("2026-03-29T01:15:00Z"));
  });

  it("takes the earlier of two instants in the fall-back overlap", () => {
    expect(zonedInstant("2026-10-25", SLOT, HELSINKI)).toEqual(new Date("2026-10-25T00:15:00Z"));
  });

  it("is exact on an ordinary day", () => {
    expect(zonedInstant("2026-10-02", SLOT, HELSINKI)).toEqual(new Date("2026-10-02T00:15:00Z"));
  });
});

describe("monthWindow", () => {
  it("covers October 2026 in London, across the clock change", () => {
    expect(monthWindow(new Date("2026-10-15T12:00:00Z"), LONDON)).toEqual({
      label: "2026-10",
      start: new Date("2026-09-30T23:00:00Z"),
      end: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it("uses the local month, not the UTC one", () => {
    // 1 October 10:00 in Sydney is still 30 September in UTC.
    expect(monthWindow(new Date("2026-10-01T00:00:00Z"), SYDNEY).label).toBe("2026-10");
  });

  it("starts and ends at local midnight across Sydney's DST change", () => {
    expect(monthWindow(new Date("2026-10-20T00:00:00Z"), SYDNEY)).toEqual({
      label: "2026-10",
      start: new Date("2026-09-30T14:00:00Z"),
      end: new Date("2026-10-31T13:00:00Z"),
    });
  });

  it("rolls over into the next year in December", () => {
    expect(monthWindow(new Date("2026-12-15T12:00:00Z"), LONDON)).toEqual({
      label: "2026-12",
      start: new Date("2026-12-01T00:00:00Z"),
      end: new Date("2027-01-01T00:00:00Z"),
    });
  });
});

// First Sundays: 6 Sep, 4 Oct and 1 Nov 2026 (the 1st is a Sunday), 6 Dec 2026, 3 Jan 2027.
describe("latestMonthlySlot", () => {
  const at = (iso: string, timeZone = LONDON) => latestMonthlySlot(new Date(iso), timeZone);

  it("is the previous month's slot until this month's first Sunday at 21:00", () => {
    expect(at("2026-10-02T12:00:00Z")).toEqual({
      at: new Date("2026-09-06T20:00:00Z"),
      month: "2026-09",
    });
    expect(at("2026-10-04T19:59:00Z")).toMatchObject({ month: "2026-09" }); // 20:59 BST
  });

  it("is this month's slot from 21:00 on its first Sunday", () => {
    const october = { at: new Date("2026-10-04T20:00:00Z"), month: "2026-10" };
    expect(at("2026-10-04T20:00:00Z")).toEqual(october);
    expect(at("2026-10-31T23:00:00Z")).toEqual(october);
  });

  it("finds the first Sunday when the 1st is a Sunday", () => {
    expect(at("2026-11-01T20:59:00Z")).toMatchObject({ month: "2026-10" }); // 20:59 GMT
    expect(at("2026-11-01T21:00:00Z")).toEqual({
      at: new Date("2026-11-01T21:00:00Z"),
      month: "2026-11",
    });
  });

  it("keeps 21:00 local in the month Sydney changes to daylight time", () => {
    // 4 October: 02:00 AEST becomes 03:00 AEDT, so 21:00 is 10:00 UTC (it was 11:00 in September).
    expect(at("2026-10-04T09:59:00Z", SYDNEY)).toEqual({
      at: new Date("2026-09-06T11:00:00Z"),
      month: "2026-09",
    });
    expect(at("2026-10-04T10:00:00Z", SYDNEY)).toEqual({
      at: new Date("2026-10-04T10:00:00Z"),
      month: "2026-10",
    });
  });

  it("reaches back across the year end", () => {
    expect(at("2027-01-02T12:00:00Z")).toEqual({
      at: new Date("2026-12-06T21:00:00Z"),
      month: "2026-12",
    });
  });
});

describe("nextMonthlySlot", () => {
  it("is this month's slot before it, then next month's", () => {
    expect(nextMonthlySlot(new Date("2026-10-02T12:00:00Z"), LONDON)).toEqual(
      new Date("2026-10-04T20:00:00Z"),
    );
    expect(nextMonthlySlot(new Date("2026-10-04T20:00:00Z"), LONDON)).toEqual(
      new Date("2026-11-01T21:00:00Z"),
    );
    expect(nextMonthlySlot(new Date("2026-12-20T12:00:00Z"), LONDON)).toEqual(
      new Date("2027-01-03T21:00:00Z"),
    );
  });
});
