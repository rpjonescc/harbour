import { EFFORT_PHRASE, IMPACT_PHRASE, STATUS_COLUMN, WHO_PHRASE, whoIsOnIt } from "./actions";

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
