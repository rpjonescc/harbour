import {
  describeStamp,
  draftPath,
  isNoteStamp,
  noteMinute,
  notePath,
  noteStamp,
  scheduledStamp,
  stampInstant,
} from "./stamp";

describe("note stamps", () => {
  it("are the local day and time, as the file name uses them", () => {
    expect(noteStamp({ day: "2026-10-02", minute: 6 * 60 + 30 })).toBe("2026-10-02-0630");
    expect(noteStamp({ day: "2026-10-02", minute: 0 })).toBe("2026-10-02-0000");
    expect(notePath("2026-10-02-0630")).toBe("notes/daily/2026-10-02-0630.md");
    expect(draftPath("2026-10-02-0630")).toBe("notes/daily/2026-10-02-0630.draft.md");
    expect(describeStamp("2026-10-02-0630")).toBe("2026-10-02 06:30");
  });

  it.each([
    "2026-10-02-2460",
    "2026-10-02-2400",
    "2026-13-02-0630",
    "2026-02-30-0630",
    "2026-10-02-063",
    "../etc/passwd",
    "2026-10-02-0630.md",
    "",
  ])("refuse %j", (stamp) => {
    expect(isNoteStamp(stamp)).toBe(false);
    expect(() => notePath(stamp)).toThrow(/Invalid note stamp/);
    expect(() => draftPath(stamp)).toThrow(/Invalid note stamp/);
  });

  it("turn back into the instant, in the owner's zone", () => {
    expect(stampInstant("2026-10-02-0630", "Europe/London").toISOString()).toBe(
      "2026-10-02T05:30:00.000Z",
    );
    expect(stampInstant("2026-10-02-0630", "Australia/Brisbane").toISOString()).toBe(
      "2026-10-01T20:30:00.000Z",
    );
  });

  it("come from HARBOUR_NOTE_TIME", () => {
    expect(noteMinute("06:30")).toBe(390);
    expect(noteMinute("00:00")).toBe(0);
    expect(noteMinute("23:59")).toBe(1439);
    expect(scheduledStamp("2026-10-02", "06:30")).toBe("2026-10-02-0630");
  });
});
