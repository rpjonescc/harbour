import { AGENT_JOB_KINDS, CONTENT_AGENT_KINDS, isAgentJobKind } from "./job-kinds";

describe("isAgentJobKind", () => {
  it("is true only for the kinds the agent runner handles", () => {
    expect(AGENT_JOB_KINDS).toEqual([
      "research",
      "discovery",
      "weekly-analyst",
      "daily-note",
      ...CONTENT_AGENT_KINDS,
    ]);
    expect(CONTENT_AGENT_KINDS).toEqual([
      "content-digest",
      "content-ideas",
      "content-draft",
      "content-atomise",
      "content-gate",
    ]);
    for (const kind of AGENT_JOB_KINDS) expect(isAgentJobKind(kind)).toBe(true);
    // The decision job writes through git itself and never reaches an agent.
    for (const kind of ["content-decision", "backup", "retention", "scan", "nope"]) {
      expect(isAgentJobKind(kind)).toBe(false);
    }
  });
});
