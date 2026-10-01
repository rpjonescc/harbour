import { isoWeekLabel, isWeekLabel, latestWeeklySlot, nextWeeklySlot } from "./week";

describe("isoWeekLabel", () => {
  it.each([
    ["2026-10-02", "2026-W40"],
    ["2026-09-28", "2026-W40"],
    ["2026-10-04", "2026-W40"],
    ["2026-10-05", "2026-W41"],
    ["2026-01-01", "2026-W01"],
    ["2025-12-29", "2026-W01"],
    ["2026-12-31", "2026-W53"],
    ["2027-01-03", "2026-W53"],
    ["2027-01-04", "2027-W01"],
    ["2021-01-03", "2020-W53"],
  ])("%s is %s", (day, label) => {
    expect(isoWeekLabel(day)).toBe(label);
  });

  it("refuses anything but a calendar date", () => {
    expect(() => isoWeekLabel("2026-13-01")).toThrow(/invalid date/i);
    expect(() => isoWeekLabel("yesterday")).toThrow(/invalid date/i);
  });
});

describe("latestWeeklySlot", () => {
  const london = "Europe/London";

  it("is this Sunday from 20:00 local, last Sunday before it", () => {
    // Sunday 4 October 2026, BST (UTC+1): 20:00 local is 19:00Z.
    expect(latestWeeklySlot(new Date("2026-10-04T18:59:00Z"), london)).toEqual({
      at: new Date("2026-09-27T19:00:00Z"),
      week: "2026-W39",
    });
    expect(latestWeeklySlot(new Date("2026-10-04T19:00:00Z"), london)).toEqual({
      at: new Date("2026-10-04T19:00:00Z"),
      week: "2026-W40",
    });
  });

  it("is the Sunday before on a weekday", () => {
    expect(latestWeeklySlot(new Date("2026-10-02T12:00:00Z"), london)).toEqual({
      at: new Date("2026-09-27T19:00:00Z"),
      week: "2026-W39",
    });
  });

  it("follows the clocks going back in London", () => {
    // Clocks go back at 02:00 on Sunday 25 October 2026: 20:00 that evening is GMT.
    expect(latestWeeklySlot(new Date("2026-10-25T20:00:00Z"), london).at).toEqual(
      new Date("2026-10-25T20:00:00Z"),
    );
    expect(latestWeeklySlot(new Date("2026-10-25T19:59:00Z"), london).at).toEqual(
      new Date("2026-10-18T19:00:00Z"),
    );
  });

  it("follows the clocks going forward in Sydney", () => {
    // Daylight saving starts at 02:00 on Sunday 4 October 2026: 20:00 that evening is UTC+11.
    const sydney = "Australia/Sydney";
    expect(latestWeeklySlot(new Date("2026-10-04T09:00:00Z"), sydney)).toEqual({
      at: new Date("2026-10-04T09:00:00Z"),
      week: "2026-W40",
    });
    expect(latestWeeklySlot(new Date("2026-10-04T08:59:00Z"), sydney).at).toEqual(
      new Date("2026-09-27T10:00:00Z"),
    );
  });

  it("labels a slot across the year end by its Sunday", () => {
    expect(latestWeeklySlot(new Date("2027-01-04T12:00:00Z"), "UTC")).toEqual({
      at: new Date("2027-01-03T20:00:00Z"),
      week: "2026-W53",
    });
  });
});

describe("nextWeeklySlot", () => {
  it("is the next Sunday 20:00 local after now", () => {
    expect(nextWeeklySlot(new Date("2026-10-02T12:00:00Z"), "Europe/London")).toEqual(
      new Date("2026-10-04T19:00:00Z"),
    );
    expect(nextWeeklySlot(new Date("2026-10-04T19:00:00Z"), "Europe/London")).toEqual(
      new Date("2026-10-11T19:00:00Z"),
    );
  });

  it("crosses a clock change at the local time", () => {
    expect(nextWeeklySlot(new Date("2026-10-20T12:00:00Z"), "Europe/London")).toEqual(
      new Date("2026-10-25T20:00:00Z"),
    );
    expect(nextWeeklySlot(new Date("2026-10-01T00:00:00Z"), "Australia/Sydney")).toEqual(
      new Date("2026-10-04T09:00:00Z"),
    );
  });
});

describe("isWeekLabel", () => {
  it("accepts ISO week labels only", () => {
    for (const week of ["2026-W01", "2026-W40", "2026-W53"]) expect(isWeekLabel(week)).toBe(true);
    for (const week of ["2026-W00", "2026-W54", "2026-40", "2026-W4", "../x", "2026-W40\n"])
      expect(isWeekLabel(week)).toBe(false);
  });
});
