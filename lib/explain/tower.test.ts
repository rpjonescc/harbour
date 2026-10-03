import {
  agoPhrase,
  LIGHT_LABELS,
  type LightId,
  type LightTone,
  NOTHING_NEEDS_YOU,
  NOTHING_RAN,
  QUIET_WEEK,
  SECTION_TITLES,
  TILE_FAILED,
  TONE_WORDS,
  towerHeadline,
  UPDATES_PAUSED,
} from "./tower";

const t0 = new Date("2026-10-02T09:00:00Z"); // 10:00 in London (summer time)
const LONDON = "Europe/London";
const ago = (ms: number) => agoPhrase(new Date(t0.getTime() - ms), t0, LONDON, "en-GB");
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("agoPhrase", () => {
  it("says just now under a minute, even for a time a moment ahead", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(59_000)).toBe("just now");
    expect(ago(-5_000)).toBe("just now");
  });

  it("counts minutes under an hour and hours under a day", () => {
    expect(ago(MIN)).toBe("1 min ago");
    expect(ago(59 * MIN)).toBe("59 min ago");
    expect(ago(HOUR)).toBe("1 h ago");
    expect(ago(23 * HOUR + 59 * MIN)).toBe("23 h ago");
  });

  it("says yesterday with the owner's local time, then the date", () => {
    // 2026-10-01 08:10 UTC is 09:10 in London, the day before.
    expect(agoPhrase(new Date("2026-10-01T08:10:00Z"), t0, LONDON, "en-GB")).toBe(
      "yesterday at 09:10",
    );
    expect(agoPhrase(new Date("2026-08-30T12:00:00Z"), t0, LONDON, "en-GB")).toBe("on 30 Aug");
  });

  it("decides yesterday by the owner's calendar, not by UTC", () => {
    const now = new Date("2026-10-02T00:30:00Z"); // 01:30 on 2 Oct in London
    const at = new Date("2026-09-30T23:30:00Z"); // 00:30 on 1 Oct in London, 25 h earlier
    expect(agoPhrase(at, now, LONDON, "en-GB")).toBe("yesterday at 00:30");
  });
});

describe("towerHeadline", () => {
  it("says everything is running, and counts what needs the owner", () => {
    expect(towerHeadline({ worst: null, needsCount: 0 })).toBe(
      "Everything is running. Nothing needs you right now.",
    );
    expect(towerHeadline({ worst: null, needsCount: 1 })).toBe(
      "Everything is running. 1 thing needs you.",
    );
    expect(towerHeadline({ worst: null, needsCount: 2 })).toBe(
      "Everything is running. 2 things need you.",
    );
  });

  it("leads with a light that needs the owner, counting it among the needs", () => {
    const worst = {
      id: "worker" as const,
      sentence: "The worker isn't running, so nothing new will happen.",
    };
    expect(towerHeadline({ worst, needsCount: 1 })).toBe(
      "The worker isn't running, so nothing new will happen. Nothing else needs you.",
    );
    expect(towerHeadline({ worst, needsCount: 2 })).toBe(
      "The worker isn't running, so nothing new will happen. 1 more thing needs you.",
    );
    expect(towerHeadline({ worst, needsCount: 4 })).toBe(
      "The worker isn't running, so nothing new will happen. 3 more things need you.",
    );
  });

  it("ends a light's sentence with a full stop when it has none", () => {
    const worst = { id: "spend" as const, sentence: "Budget reached" };
    expect(towerHeadline({ worst, needsCount: 1 })).toBe("Budget reached. Nothing else needs you.");
  });
});

describe("tower words", () => {
  it("names every light and every tone in words", () => {
    const lights: LightId[] = [
      "website",
      "worker",
      "schedules",
      "checks",
      "backups",
      "sources",
      "agents",
      "spend",
    ];
    const tones: LightTone[] = ["ok", "busy", "watch", "act", "off", "unknown"];
    expect(Object.keys(LIGHT_LABELS)).toEqual(lights);
    expect(Object.keys(TONE_WORDS)).toEqual(tones);
    expect(Object.keys(SECTION_TITLES)).toEqual([
      "systems",
      "needs",
      "work",
      "products",
      "activity",
      "wins",
    ]);
  });

  it("says what happened, whether it matters and what to do", () => {
    expect(TILE_FAILED).toMatch(/couldn't read this/);
    expect(TILE_FAILED).toMatch(/rest of the page is fine/);
    expect(NOTHING_NEEDS_YOU).toMatch(/^Nothing needs you right now\./);
    expect(QUIET_WEEK).toMatch(/^A quiet week so far\./);
    expect(UPDATES_PAUSED).toBe("Updates paused. Reload to see the latest.");
    expect(NOTHING_RAN(null)).toBe("Nothing ran in the last day.");
    expect(NOTHING_RAN("06:00")).toBe("Nothing ran in the last day. The next run is at 06:00.");
  });

  it("keeps codes and the word scan out of every fixed phrase", () => {
    const text = [
      ...Object.values(SECTION_TITLES),
      ...Object.values(LIGHT_LABELS),
      ...Object.values(TONE_WORDS),
      TILE_FAILED,
      NOTHING_NEEDS_YOU,
      QUIET_WEEK,
      UPDATES_PAUSED,
      NOTHING_RAN("06:00"),
    ].join(" ");
    expect(text).not.toMatch(/\b(SEO|GEO|AEO)\b|HARBOUR_|\b(?:re)?scan/i);
  });
});
