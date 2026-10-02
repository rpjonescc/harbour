import { approvalFailure, approvalsPhrase } from "./approvals";

describe("approvalsPhrase", () => {
  it("counts research targets waiting for the owner's OK", () => {
    expect(approvalsPhrase(1)).toBe("1 research target waiting for your OK");
    expect(approvalsPhrase(3)).toBe("3 research targets waiting for your OK");
  });
});

describe("approvalFailure", () => {
  it("explains the pillar limit and passes other failures through", () => {
    expect(approvalFailure("pillar_limit", "x")).toMatch(/six approved content pillars/);
    expect(approvalFailure("network_error", "Try again.")).toBe("Try again.");
  });
});
