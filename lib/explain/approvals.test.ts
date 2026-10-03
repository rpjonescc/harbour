import {
  approvalFailure,
  approvalsPhrase,
  editFailureMessage,
  emptyProposalsMessage,
  intentLabel,
  proposalStatusLabel,
  proposalTypePlural,
} from "./approvals";

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

describe("proposal wording", () => {
  it("uses plain words for statuses, intents and types", () => {
    expect(proposalStatusLabel("proposed")).toBe("Waiting for your OK");
    expect(proposalStatusLabel("approved")).toBe("Approved");
    expect(intentLabel("navigational")).toBe("looking for you");
    expect(intentLabel("informational")).toBe("wants to learn");
    expect(proposalTypePlural("pillar")).toBe("content pillars");
  });

  it("says why an empty list is empty and what to do", () => {
    const text = emptyProposalsMessage("Acme Docs");
    expect(text).toMatch(/finds ideas/);
    expect(text).not.toMatch(/discovery/i);
  });
});

describe("editFailureMessage", () => {
  it("rewrites each raw check into plain words", () => {
    expect(editFailureMessage("term: Too small: expected string to have >=1 characters")).toBe(
      "The search phrase can't be empty. Fill it in.",
    );
    expect(editFailureMessage("key: can't change once the pillar is approved")).toMatch(
      /short code can't change/,
    );
    expect(editFailureMessage("rejected items can't be edited")).toMatch(/rejected/);
    expect(editFailureMessage("An item with that value already exists")).toMatch(/already have/);
    expect(editFailureMessage("url: Invalid URL")).toMatch(/http/);
  });

  it("keeps one line per distinct problem and never shows field codes", () => {
    const out = editFailureMessage("term: Too small\nintent: Invalid option\nweird");
    expect(out.split("\n")).toHaveLength(3);
    expect(out).not.toMatch(/term:|intent:|Invalid option/);
  });
});
