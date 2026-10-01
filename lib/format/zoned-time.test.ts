import {
  addDays,
  latestDailySlotDay,
  monthWindow,
  nextDailySlot,
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
