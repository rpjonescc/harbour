import { BRAIN_SEARCH_EMPTY, brainSearchFailure } from "./brain-search";

describe("brainSearchFailure", () => {
  it("tells the owner what to do and never shows codes or raw errors", () => {
    for (const unavailable of [true, false]) {
      const text = brainSearchFailure(unavailable);
      expect(text).not.toMatch(/HTTP|\d{3}|zod|undefined/i);
      expect(text).toMatch(/try|check/i);
    }
    expect(brainSearchFailure(true)).toMatch(/notes are safe/);
    expect(BRAIN_SEARCH_EMPTY).toMatch(/Try fewer/);
  });
});
