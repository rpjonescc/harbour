import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectionOf, migrateDb, openDb } from "@/lib/db/client";
import { addScans } from "@/tests/helpers/retention";
import { checkRetention } from "./retention-check";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-retention-check-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
  const path = join(dir, "harbour.db");
  const db = openDb(path);
  migrateDb(db);
  addScans(db, "acme-docs", 35);
  addScans(db, "retired-docs", 12);
  connectionOf(db).close();
  return path;
}

const hash = (name: string) =>
  createHash("sha256")
    .update(readFileSync(join(dir, name)))
    .digest("hex");

describe("checkRetention", () => {
  it("prints the plan and the row counts, and writes nothing", () => {
    const path = fixture();
    const before = hash("harbour.db");
    expect(checkRetention(path, 30)).toEqual({
      code: 0,
      lines: [
        "keep 30 scans with observations per product",
        "acme-docs: 5 old scans, 15 observations",
        "retired-docs: nothing to prune (12 scans)",
        "total: 5 old scans, 15 observations to remove",
        "rows: observations 141, jobs 2, agent_run_events 0",
      ],
    });
    expect(hash("harbour.db")).toBe(before);
    // SQLite's read-only WAL connection leaves an empty log and its index, private like the db.
    expect(statSync(join(dir, "harbour.db-wal")).size).toBe(0);
    for (const name of readdirSync(dir)) {
      expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600);
    }
  });

  it("fails with a message when the database cannot be opened", () => {
    expect(checkRetention(dir, 30)).toEqual({
      code: 1,
      lines: [
        expect.stringMatching(/^Could not open the database read-only: /),
        expect.stringContaining("write access to the data folder"),
      ],
    });
  });

  it("fails with a message when the database is missing", () => {
    const path = join(dir, "missing.db");
    expect(checkRetention(path, 30)).toEqual({
      code: 1,
      lines: [`Database not found: ${path}`],
    });
    expect(readdirSync(dir)).toEqual([]);
  });
});
