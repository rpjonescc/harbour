import { addDays, isIsoDay, isoDaySchema, parseDay } from "./iso-day";

describe("isIsoDay", () => {
  it.each(["2026-10-03", "2028-02-29", "2026-12-31"])("accepts the real date %s", (day) => {
    expect(isIsoDay(day)).toBe(true);
  });

  it.each([
    "2026-02-31",
    "2026-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-10-3",
    " 2026-10-03",
    "2026-10-03T00:00:00Z",
    "",
  ])("refuses %j", (day) => {
    expect(isIsoDay(day)).toBe(false);
  });
});

describe("isoDaySchema", () => {
  it("parses a real date and refuses an impossible one", () => {
    expect(isoDaySchema.parse("2026-10-03")).toBe("2026-10-03");
    expect(isoDaySchema.safeParse("2026-02-31").success).toBe(false);
    expect(isoDaySchema.safeParse(20261003).success).toBe(false);
  });
});

describe("parseDay", () => {
  it("is midnight UTC of the day, and throws for a day that does not exist", () => {
    expect(parseDay("2026-10-03")).toBe(Date.UTC(2026, 9, 3));
    expect(() => parseDay("2026-02-31")).toThrow("Invalid date");
  });
});

describe("addDays", () => {
  it("moves across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-10-02", 365)).toBe("2027-10-02");
  });

  it("rejects a malformed day", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow("Invalid date");
  });
});
