import { PIECE_STATES, type PieceAction, revisionMatches, transition } from "./state";

const ALLOWED: Record<PieceAction, string[]> = {
  finish: ["drafting"],
  edit: ["ready", "needs-you"],
  approve: ["ready", "needs-you"],
  discard: ["drafting", "ready", "needs-you", "approved"],
};

describe("piece state machine", () => {
  for (const action of Object.keys(ALLOWED) as PieceAction[]) {
    it.each(PIECE_STATES)(`${action} from %s`, (from) => {
      const result = transition(from, action, "needs-you");
      if (!ALLOWED[action].includes(from)) return expect(result).toBeNull();
      expect(result).toBe(
        action === "approve" ? "approved" : action === "discard" ? "discarded" : "needs-you",
      );
    });
  }

  it("lets finish and edit land on ready by default", () => {
    expect(transition("drafting", "finish")).toBe("ready");
    expect(transition("needs-you", "edit")).toBe("ready");
  });

  it("guards on the revision the file holds", () => {
    expect(revisionMatches(3, 3)).toBe(true);
    expect(revisionMatches(4, 3)).toBe(false);
  });
});
