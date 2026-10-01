import { openTestDb } from "@/tests/helpers/db";
import { consumeSetupToken, issueSetupToken, SETUP_TOKEN_TTL_MS } from "./setup-tokens";

const t0 = new Date("2026-10-01T00:00:00Z");

describe("setup tokens", () => {
  it("can be used exactly once", () => {
    const db = openTestDb();
    const { token } = issueSetupToken(db, t0);
    expect(consumeSetupToken(db, token, t0)).toBe(true);
    expect(consumeSetupToken(db, token, t0)).toBe(false);
  });

  it("expire after the TTL", () => {
    const db = openTestDb();
    const { token } = issueSetupToken(db, t0);
    expect(consumeSetupToken(db, token, new Date(t0.getTime() + SETUP_TOKEN_TTL_MS + 1))).toBe(
      false,
    );
  });

  it("rejects unknown tokens", () => {
    expect(consumeSetupToken(openTestDb(), "made-up", t0)).toBe(false);
  });
});
