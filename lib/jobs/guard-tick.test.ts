import { guardTick } from "./guard-tick";

describe("guardTick", () => {
  it("returns the duty's result and swallows a throw, warning once per run of failures", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let fail = true;
    const duty = guardTick("scan schedule", () => {
      if (fail) throw new RangeError("database is locked");
      return 3;
    });
    try {
      expect(duty()).toBeUndefined();
      expect(duty()).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("scan schedule");
      expect(String(warn.mock.calls[0]?.[0])).toContain("RangeError: database is locked");
      fail = false;
      expect(duty()).toBe(3);
      fail = true;
      duty(); // failing again after a success warns again
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps one failing duty from blocking the others", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ran: string[] = [];
    const duties = [
      guardTick("a", () => {
        throw new Error("a broke");
      }),
      guardTick("b", () => ran.push("b")),
    ];
    try {
      for (const duty of duties) duty();
      expect(ran).toEqual(["b"]);
    } finally {
      warn.mockRestore();
    }
  });
});
