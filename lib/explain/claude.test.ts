import { CLAUDE_CONNECT_STEPS, CLAUDE_OFF, CLAUDE_OFF_HERE } from "./claude";

describe("Claude connection words", () => {
  it("keeps the setting name in the steps, never in the visible lines", () => {
    expect(CLAUDE_CONNECT_STEPS.join(" ")).toContain("HARBOUR_CLAUDE_OAUTH_TOKEN");
    expect(CLAUDE_CONNECT_STEPS.join(" ")).toContain("claude setup-token");
    for (const line of [CLAUDE_OFF, CLAUDE_OFF_HERE]) expect(line).not.toMatch(/HARBOUR_/);
  });
});
