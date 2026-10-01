import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { connectionOf, openDb } from "./client";

describe("openDb", () => {
  it("creates parent directory with mode 0o700 and DB file with mode 0o600", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "harbour-"));
    const dbPath = join(tempDir, "sub", "test.db");

    openDb(dbPath);

    const dbMode = statSync(dbPath).mode & 0o777;
    const subDirMode = statSync(join(tempDir, "sub")).mode & 0o777;

    expect(dbMode).toBe(0o600);
    expect(subDirMode).toBe(0o700);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("tightens a pre-existing data directory to 0o700", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "harbour-"));
    const dataDir = join(tempDir, "data");
    mkdirSync(dataDir, { mode: 0o755 });
    expect(statSync(dataDir).mode & 0o777).toBe(0o755);

    openDb(join(dataDir, "test.db"));

    expect(statSync(dataDir).mode & 0o777).toBe(0o700);
    rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("connectionOf", () => {
  it("returns the raw connection of a database, and refuses a transaction", () => {
    const db = openDb(":memory:");
    expect(connectionOf(db)).toBeInstanceOf(Database);
    db.transaction((tx) => {
      expect(() => connectionOf(tx)).toThrow("Not a top-level database connection");
    });
  });
});
