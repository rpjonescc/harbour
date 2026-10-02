import { dayPartOf, restOf } from "./day-part";

describe("dayPartOf", () => {
  it.each([
    [4, "night"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [21, "evening"],
    [22, "night"],
    [0, "night"],
  ] as const)("hour %i is %s", (hour, part) => {
    expect(dayPartOf(hour)).toBe(part);
  });
});

describe("restOf", () => {
  const at = (weekday: string, hour: number, minute = 0) => restOf({ weekday, hour, minute });

  it("is no rest on a working morning, including the default 06:30 note", () => {
    expect(at("Friday", 6, 30)).toBeNull();
    expect(at("Monday", 5)).toBeNull();
    expect(at("Wednesday", 19, 59)).toBeNull();
  });

  it("is out of hours from 20:00 to 04:59", () => {
    expect(at("Friday", 20)).toBe("out-of-hours");
    expect(at("Friday", 23, 59)).toBe("out-of-hours");
    expect(at("Tuesday", 4, 59)).toBe("out-of-hours");
  });

  it("is the weekend all day, and the weekend wins over the hour", () => {
    expect(at("Saturday", 6, 30)).toBe("weekend");
    expect(at("Sunday", 22)).toBe("weekend");
  });
});
