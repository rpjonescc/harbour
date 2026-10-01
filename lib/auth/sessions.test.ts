import { sessions } from "@/lib/db/schema";
import { openTestDb } from "@/tests/helpers/db";
import { createSession, revokeSession, SESSION_TTL_MS, validateSession } from "./sessions";
import { hashToken } from "./token";

const t0 = new Date("2026-10-01T00:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

describe("sessions", () => {
  it("stores only a hash of the token", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", null, t0);
    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
  });

  it("validates a fresh session for the same login", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", null, t0);
    expect(validateSession(db, token, "owner@example.com", later(1000))?.login).toBe(
      "owner@example.com",
    );
  });

  it("rejects a session presented under a different Tailscale login", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", null, t0);
    expect(validateSession(db, token, "other@example.com", later(1000))).toBeNull();
  });

  it("rejects unknown and expired tokens", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", null, t0);
    expect(validateSession(db, "nope", "owner@example.com", t0)).toBeNull();
    expect(validateSession(db, token, "owner@example.com", later(SESSION_TTL_MS + 1))).toBeNull();
  });

  it("slides expiry forward when used after a day", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", null, t0);
    const result = validateSession(db, token, "owner@example.com", later(2 * DAY));
    expect(result?.expiresAt.getTime()).toBe(later(2 * DAY + SESSION_TTL_MS).getTime());
    expect(
      validateSession(db, token, "owner@example.com", later(SESSION_TTL_MS + DAY)),
    ).not.toBeNull();
  });

  it("does not touch the row when used again within a day", () => {
    const db = openTestDb();
    const { token, expiresAt } = createSession(db, "owner@example.com", null, t0);
    expect(validateSession(db, token, "owner@example.com", later(DAY - 1))).not.toBeNull();
    const row = db.select().from(sessions).get();
    expect(row?.expiresAt).toEqual(expiresAt);
    expect(row?.lastSeenAt).toEqual(t0);
  });

  it("revokes a session", () => {
    const db = openTestDb();
    const { token } = createSession(db, "owner@example.com", null, t0);
    revokeSession(db, token);
    expect(validateSession(db, token, "owner@example.com", t0)).toBeNull();
  });
});
