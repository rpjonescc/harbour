import { authChallenges } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { CHALLENGE_TTL_MS, consumeChallenge, saveChallenge } from "./challenges";

const t0 = new Date("2026-10-01T00:00:00Z");
const login = "owner@example.com";

describe("challenges", () => {
  it("returns the challenge once, then never again", () => {
    const db = openTestDb();
    const flowId = saveChallenge(db, { kind: "authenticate", login, challenge: "c1" }, t0);
    expect(consumeChallenge(db, { flowId, kind: "authenticate", login }, t0)).toBe("c1");
    expect(consumeChallenge(db, { flowId, kind: "authenticate", login }, t0)).toBeNull();
  });

  it("rejects the wrong ceremony kind or login", () => {
    const db = openTestDb();
    const flowId = saveChallenge(db, { kind: "register", login, challenge: "c1" }, t0);
    expect(consumeChallenge(db, { flowId, kind: "authenticate", login }, t0)).toBeNull();
    const flow2 = saveChallenge(db, { kind: "register", login, challenge: "c2" }, t0);
    expect(
      consumeChallenge(db, { flowId: flow2, kind: "register", login: "x@y.z" }, t0),
    ).toBeNull();
  });

  it("rejects expired challenges", () => {
    const db = openTestDb();
    const flowId = saveChallenge(db, { kind: "register", login, challenge: "c1" }, t0);
    const late = new Date(t0.getTime() + CHALLENGE_TTL_MS + 1);
    expect(consumeChallenge(db, { flowId, kind: "register", login }, late)).toBeNull();
  });

  it("purges expired challenges whenever a new one is saved", () => {
    const db = openTestDb();
    saveChallenge(db, { kind: "register", login, challenge: "old" }, t0);
    const late = new Date(t0.getTime() + CHALLENGE_TTL_MS + 1);
    saveChallenge(db, { kind: "register", login, challenge: "new" }, late);
    expect(
      db
        .select()
        .from(authChallenges)
        .all()
        .map((r) => r.challenge),
    ).toEqual(["new"]);
  });
});
