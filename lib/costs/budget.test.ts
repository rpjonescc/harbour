import {
  audToMicro,
  budgetLevel,
  canSpend,
  formatAud,
  MICRO_PER_AUD,
  projectMonth,
} from "./budget";

const SYDNEY = "Australia/Sydney";
const A$ = (aud: number) => aud * MICRO_PER_AUD;

describe("audToMicro", () => {
  it("converts dollars to whole micro-AUD without float drift", () => {
    expect(audToMicro(0.1)).toBe(100_000);
    expect(audToMicro(60)).toBe(60_000_000);
    expect(audToMicro(0.0006)).toBe(600);
    expect(Number.isInteger(audToMicro(0.29 * 3))).toBe(true);
  });
});

describe("budgetLevel", () => {
  const cap = A$(60);
  it("is none when no budget is set", () => {
    expect(budgetLevel(0, 0)).toBe("none");
    expect(budgetLevel(A$(5), 0)).toBe("none");
  });

  it("is ok below 80 %, warn from 80 % and reached from 100 %", () => {
    expect(budgetLevel(0, cap)).toBe("ok");
    expect(budgetLevel((cap * 799) / 1000, cap)).toBe("ok");
    expect(budgetLevel((cap * 8) / 10, cap)).toBe("warn");
    expect(budgetLevel(cap - 1, cap)).toBe("warn");
    expect(budgetLevel(cap, cap)).toBe("reached");
    expect(budgetLevel(cap + 1, cap)).toBe("reached");
  });
});

describe("canSpend", () => {
  it("never allows a paid call without a budget", () => {
    expect(canSpend(0, 0, 0)).toBe(false);
    expect(canSpend(0, 0, 1)).toBe(false);
  });

  it("allows an exact fit and refuses one micro-AUD over", () => {
    expect(canSpend(A$(0.98), A$(1), A$(0.02))).toBe(true);
    expect(canSpend(A$(0.98) + 1, A$(1), A$(0.02))).toBe(false);
  });
});

describe("projectMonth", () => {
  it("is null before one full local day of the month has passed", () => {
    // 1 Oct 20:00 in Sydney (AEST, +10): 20 h into the month.
    expect(projectMonth(A$(5), new Date("2026-10-01T10:00:00Z"), SYDNEY)).toBeNull();
  });

  it("is null when nothing was spent", () => {
    expect(projectMonth(0, new Date("2026-10-15T12:00:00Z"), "UTC")).toBeNull();
  });

  it("projects the month-to-date rate over the whole month", () => {
    // Halfway through a 30-day month (UTC): spend doubles.
    expect(projectMonth(A$(10), new Date("2026-11-16T00:00:00Z"), "UTC")).toBe(A$(20));
  });

  it("uses the real month length in a 28-day February", () => {
    // 7 of 28 days elapsed: four times the spend.
    expect(projectMonth(A$(3), new Date("2027-02-08T00:00:00Z"), "UTC")).toBe(A$(12));
  });
});

describe("formatAud", () => {
  it("formats micro-AUD as Australian dollars with two decimals", () => {
    expect(formatAud(A$(12.4), "en-GB")).toBe("A$12.40");
    expect(formatAud(600, "en-GB")).toBe("A$0.00");
    expect(formatAud(A$(60.125), "en-US")).toBe("A$60.13");
    expect(formatAud(A$(1234.5), "en-AU")).toBe("$1,234.50");
  });
});
