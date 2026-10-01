import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BACKUP_NAME,
  BACKUPS_KEPT,
  backupDirFor,
  backupFileName,
  backupsToPrune,
  listBackups,
  PARTIAL_NAME,
} from "./backup-files";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harbour-backup-files-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("backup names", () => {
  it("names a backup by its local day", () => {
    expect(backupFileName("2026-10-02")).toBe("harbour-2026-10-02.db");
    expect(BACKUP_NAME.test("harbour-2026-10-02.db")).toBe(true);
    expect(PARTIAL_NAME.test("harbour-2026-10-02.db.partial")).toBe(true);
  });

  it("refuses anything that is not a YYYY-MM-DD day", () => {
    expect(() => backupFileName("../2026-10-02")).toThrow();
    expect(() => backupFileName("2026-13-01")).toThrow();
  });

  it("matches only the exact pattern", () => {
    for (const name of [
      "harbour-2026-10-02.db-wal",
      "harbour-2026-10-02.db.bak",
      "xharbour-2026-10-02.db",
      "harbour-2026-10-2.db",
      "notes.txt",
    ]) {
      expect(BACKUP_NAME.test(name)).toBe(false);
    }
  });
});

describe("backupDirFor", () => {
  it("defaults to a backups folder next to the database, absolute", () => {
    expect(
      backupDirFor({ HARBOUR_DB_PATH: "./data/harbour.db", HARBOUR_BACKUP_DIR: undefined }),
    ).toBe(resolve("data/backups"));
  });

  it("uses HARBOUR_BACKUP_DIR when set", () => {
    expect(
      backupDirFor({
        HARBOUR_DB_PATH: "./data/harbour.db",
        HARBOUR_BACKUP_DIR: "/srv/harbour-example/backups",
      }),
    ).toBe("/srv/harbour-example/backups");
  });
});

describe("listBackups", () => {
  it("is empty when the directory does not exist", () => {
    expect(listBackups(join(dir, "missing"))).toEqual([]);
  });

  it("lists regular backup files newest first and ignores everything else", () => {
    writeFileSync(join(dir, "harbour-2026-10-01.db"), "a");
    writeFileSync(join(dir, "harbour-2026-10-02.db"), "bb");
    writeFileSync(join(dir, "harbour-2026-10-02.db-wal"), "x");
    writeFileSync(join(dir, "harbour-2026-10-03.db.partial"), "x");
    writeFileSync(join(dir, "notes.txt"), "x");
    mkdirSync(join(dir, "harbour-2026-09-30.db"));
    const outside = join(dir, "..", `${dir.split("/").pop()}-target.db`);
    writeFileSync(outside, "x");
    symlinkSync(outside, join(dir, "harbour-2026-09-29.db"));
    try {
      expect(listBackups(dir)).toEqual([
        {
          name: "harbour-2026-10-02.db",
          day: "2026-10-02",
          bytes: 2,
          modifiedAt: expect.any(Date),
        },
        {
          name: "harbour-2026-10-01.db",
          day: "2026-10-01",
          bytes: 1,
          modifiedAt: expect.any(Date),
        },
      ]);
    } finally {
      rmSync(outside, { force: true });
    }
  });
});

describe("backupsToPrune", () => {
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => `harbour-2026-09-${String(i + 1).padStart(2, "0")}.db`);

  it(`keeps the newest ${BACKUPS_KEPT}`, () => {
    expect(BACKUPS_KEPT).toBe(14);
    expect(backupsToPrune(days(16))).toEqual(["harbour-2026-09-01.db", "harbour-2026-09-02.db"]);
    expect(backupsToPrune(days(14))).toEqual([]);
  });

  it("orders by day, not by the order given", () => {
    expect(backupsToPrune([...days(3)].reverse(), 2)).toEqual(["harbour-2026-09-01.db"]);
  });

  it("never names a file that does not match the backup pattern", () => {
    const names = [
      "notes.txt",
      "harbour-2026-01-01.db-wal",
      "harbour-2026-01-01.db.partial",
      "../harbour-2026-01-01.db",
      ...days(3),
    ];
    expect(backupsToPrune(names, 1)).toEqual(["harbour-2026-09-01.db", "harbour-2026-09-02.db"]);
    expect(backupsToPrune(names, 0).every((n) => BACKUP_NAME.test(n))).toBe(true);
  });
});
