import { AGENT_JOB_KINDS, isAgentJobKind } from "./job-kinds";

describe("isAgentJobKind", () => {
  it("is true only for the kinds the agent runner handles", () => {
    expect(AGENT_JOB_KINDS).toEqual(["research", "discovery", "weekly-analyst"]);
    for (const kind of AGENT_JOB_KINDS) expect(isAgentJobKind(kind)).toBe(true);
    for (const kind of ["backup", "retention", "scan", "brain-push", "notes-sync", "nope"]) {
      expect(isAgentJobKind(kind)).toBe(false);
    }
  });
});
