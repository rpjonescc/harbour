import { prJson } from "@/tests/helpers/pr-sync";
import { checksState, parsePrFacts } from "./pr-state";

const run = (status: string, conclusion: string | null = null) => ({
  __typename: "CheckRun",
  status,
  conclusion,
});
const ctx = (state: string) => ({ __typename: "StatusContext", state });

describe("parsePrFacts", () => {
  it("reads merged, closed, open and draft pull requests", () => {
    expect(parsePrFacts(prJson({ state: "MERGED", mergedAt: "2026-10-03T15:00:00Z" }))).toEqual({
      state: "merged",
      mergedAt: new Date("2026-10-03T15:00:00Z"),
    });
    expect(parsePrFacts(prJson({ state: "MERGED", mergedAt: null }))).toEqual({
      state: "merged",
      mergedAt: null,
    });
    expect(parsePrFacts(prJson({ state: "CLOSED" }))).toEqual({ state: "closed" });
    expect(parsePrFacts(prJson())).toEqual({ state: "open", draft: false, checks: "none" });
    expect(parsePrFacts(prJson({ isDraft: true }))).toMatchObject({ draft: true });
  });

  it.each([["not json"], ["null"], ['{"state":"OPEN"}'], [prJson({ state: "LOCKED" })]])(
    "returns null for %j",
    (stdout) => {
      expect(parsePrFacts(stdout)).toBeNull();
    },
  );
});

describe("checksState", () => {
  it.each([
    [[], "none"],
    [[run("COMPLETED", "SUCCESS"), ctx("SUCCESS")], "passing"],
    [[run("COMPLETED", "SUCCESS"), run("COMPLETED", "SKIPPED")], "passing"],
    [[run("COMPLETED", "CANCELLED")], "passing"],
    [[run("COMPLETED", "SUCCESS"), run("IN_PROGRESS")], "pending"],
    [[ctx("PENDING")], "pending"],
    [[run("IN_PROGRESS"), run("COMPLETED", "FAILURE")], "failing"],
    [[run("COMPLETED", "TIMED_OUT")], "failing"],
    [[ctx("ERROR")], "failing"],
  ])("%j is %s", (checks, expected) => {
    expect(checksState(checks)).toBe(expected);
  });
});
