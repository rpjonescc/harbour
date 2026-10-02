import {
  boardSummary,
  EFFORT_PHRASE,
  IMPACT_GROUP,
  IMPACT_PHRASE,
  impactTone,
  STATUS_COLUMN,
  statusChip,
  thingsWorthDoing,
  WHO_PHRASE,
  whoIsOnIt,
} from "./actions";

describe("action phrases", () => {
  it("use the spec's words for impact, effort and the board's columns", () => {
    expect(IMPACT_PHRASE).toEqual({ high: "Big win", medium: "Worth doing", low: "Small win" });
    expect(EFFORT_PHRASE).toEqual({
      small: "quick job",
      medium: "an afternoon",
      large: "a project",
    });
    expect(STATUS_COLUMN).toEqual({
      suggested: "New ideas",
      open: "To do",
      in_progress: "In progress",
      done: "Done",
      snoozed: "Snoozed",
      dismissed: "Dismissed",
    });
  });

  it("word who's on it as the spec does", () => {
    expect(WHO_PHRASE).toEqual({
      claude: "Claude is on it",
      pr_waiting: "Pull request waiting for your OK",
      you: "Waiting for you",
      undecided: "New idea, not decided yet",
    });
  });
});

describe("whoIsOnIt", () => {
  const PR = "https://github.com/example/site/pull/12";
  it.each([
    ["suggested", null, "agent", "undecided"],
    ["suggested", PR, "claude", "undecided"],
    ["open", null, "owner", "you"],
    ["open", null, "scan", "you"],
    ["open", null, "claude", "you"],
    ["open", PR, "claude", "you"],
    ["in_progress", PR, "claude", "pr_waiting"],
    ["in_progress", PR, "owner", "pr_waiting"],
    ["in_progress", null, "claude", "claude"],
    ["in_progress", null, "owner", "you"],
    ["in_progress", null, "system", "you"],
    // Review Focus 1: history pruned to no status change: never "Claude is on it".
    ["in_progress", null, null, "you"],
    ["done", PR, "claude", null],
    ["snoozed", null, "owner", null],
    ["dismissed", null, "claude", null],
  ] as const)("%s, PR %s, last moved by %s → %s", (status, prUrl, statusActor, who) => {
    expect(whoIsOnIt({ status, prUrl, statusActor })).toBe(who);
  });
});

describe("impactTone", () => {
  it("tones the size of a win once for every surface", () => {
    expect(impactTone("high")).toBe("warn");
    expect(impactTone("medium")).toBe("neutral");
    expect(impactTone("low")).toBe("neutral");
  });
});

describe("board phrases", () => {
  it("heads the impact groups in the spec's words, plural", () => {
    expect(IMPACT_GROUP).toEqual({ high: "Big wins", medium: "Worth doing", low: "Small wins" });
  });
  it("sums the board up in one plain line", () => {
    expect(boardSummary({ open: 3, in_progress: 1, suggested: 2 })).toBe(
      "3 to do · 1 in progress · 2 new ideas",
    );
    expect(boardSummary({ open: 0, in_progress: 0, suggested: 1 })).toBe(
      "0 to do · 0 in progress · 1 new idea",
    );
  });

  it("counts things worth doing the same way on Today and in the sidebar", () => {
    expect(thingsWorthDoing(1)).toBe("1 thing worth doing");
    expect(thingsWorthDoing(3)).toBe("3 things worth doing");
  });
});

describe("statusChip", () => {
  const day = (iso: string) => `day ${iso}`;

  it("says who is on it first, in the accent tone", () => {
    expect(statusChip({ status: "in_progress", who: "claude", snoozedUntil: null }, day)).toEqual({
      text: "Claude is on it",
      tone: "accent",
    });
  });

  it("says where it stands otherwise, in the board's words", () => {
    expect(statusChip({ status: "done", who: null, snoozedUntil: null }, day)).toEqual({
      text: "Done",
      tone: "neutral",
    });
    expect(statusChip({ status: "snoozed", who: null, snoozedUntil: "2026-10-09" }, day)).toEqual({
      text: "Snoozed until day 2026-10-09",
      tone: "neutral",
    });
  });

  it("on an issue card, a done action is still found, in the warn tone", () => {
    expect(statusChip({ status: "done", who: null, snoozedUntil: null }, day, true)).toEqual({
      text: "Done — still found in the last check",
      tone: "warn",
    });
  });

  it("says tracking starts with the next check for an issue with no action yet", () => {
    expect(statusChip(null, day, true)).toEqual({
      text: "Tracking starts with the next check",
      tone: "neutral",
    });
  });
});
