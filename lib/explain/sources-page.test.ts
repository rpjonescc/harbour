import { checkOutcome, NEXT_CHECK, SOURCES_INTRO } from "./sources-page";

describe("Sources page words", () => {
  it("names the outcome of a check in plain words", () => {
    expect(checkOutcome("ok")).toBe("all good");
    expect(checkOutcome("partial")).toBe("some data was missing");
    expect(checkOutcome("failed")).toBe("didn't finish");
  });

  it("describes when the next check is, with no setting names", () => {
    expect(NEXT_CHECK.tomorrow).toBe("Next check: tomorrow at 06:00");
    expect(NEXT_CHECK.off).toBe("Next check: only when you choose Check now");
    for (const line of [SOURCES_INTRO, ...Object.values(NEXT_CHECK)])
      expect(line).not.toMatch(/HARBOUR_/);
  });
});
