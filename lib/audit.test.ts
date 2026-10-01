import { openTestDb } from "@/tests/helpers/db";
import { audit } from "./audit";
import { auditLog } from "./db/schema";

describe("audit", () => {
  it("records an event with its detail", () => {
    const db = openTestDb();
    const now = new Date("2026-10-01T06:00:00Z");
    audit(db, { login: "owner@example.com", event: "login", detail: { device: "Laptop" } }, now);
    const rows = db.select().from(auditLog).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      login: "owner@example.com",
      event: "login",
      detail: { device: "Laptop" },
      at: now,
    });
  });
});
