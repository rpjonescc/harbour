import { authChallenges, sessions, setupTokens } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { purgeExpired } from "./purge";

const now = new Date("2026-10-01T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);

function seed() {
  const db = openTestDb();
  const session = { login: "owner@example.com", createdAt: at(-10), lastSeenAt: at(-10) };
  db.insert(sessions)
    .values([
      { ...session, tokenHash: "s-past", expiresAt: at(-1) },
      { ...session, tokenHash: "s-now", expiresAt: now },
      { ...session, tokenHash: "s-future", expiresAt: at(1) },
    ])
    .run();
  const challenge = { kind: "authenticate" as const, login: "owner@example.com", challenge: "c" };
  db.insert(authChallenges)
    .values([
      { ...challenge, flowId: "c-past", expiresAt: at(-1) },
      { ...challenge, flowId: "c-future", expiresAt: at(1) },
    ])
    .run();
  db.insert(setupTokens)
    .values([
      { tokenHash: "t-expired", createdAt: at(-10), expiresAt: at(-1), usedAt: null },
      { tokenHash: "t-used", createdAt: at(-10), expiresAt: at(1), usedAt: at(-5) },
      { tokenHash: "t-live", createdAt: at(-10), expiresAt: at(1), usedAt: null },
    ])
    .run();
  return db;
}

describe("purgeExpired", () => {
  it("deletes expired sessions and challenges and spent setup tokens, keeping live rows", () => {
    const db = seed();
    purgeExpired(db, now);
    expect(
      db
        .select()
        .from(sessions)
        .all()
        .map((r) => r.tokenHash),
    ).toEqual(["s-future"]);
    expect(
      db
        .select()
        .from(authChallenges)
        .all()
        .map((r) => r.flowId),
    ).toEqual(["c-future"]);
    expect(
      db
        .select()
        .from(setupTokens)
        .all()
        .map((r) => r.tokenHash),
    ).toEqual(["t-live"]);
  });
});
