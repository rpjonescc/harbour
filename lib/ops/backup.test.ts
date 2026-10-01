import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { connectionOf, type Db, migrateDb, openDb } from "@/lib/db/client";
import { enqueueJob } from "@/lib/jobs/queue";
import { BackupStopped, finaliseCopy, runBackup } from "./backup";

const DAY = "2026-10-02";
const MINUTE = 60_000;

let root: string;
let dir: string;
let db: Db;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "harbour-backup-"));
  dir = join(root, "backups");
  db = openDb(join(root, "data", "harbour.db"));
  migrateDb(db);
  for (let i = 0; i < 20; i++) enqueueJob(db, "scan", { productId: `acme-${i}` }, null);
});
afterEach(() => {
  connectionOf(db).close();
  rmSync(root, { recursive: true, force: true });
});

const mode = (path: string) => statSync(path).mode & 0o777;
const fixedClock = () => 0;

function jobCount(path: string): number {
  const copy = new Database(path, { readonly: true });
  try {
    return (copy.prepare("select count(*) as n from jobs").get() as { n: number }).n;
  } finally {
    copy.close();
  }
}

describe("runBackup", () => {
  it("writes a verified, self-contained copy with private permissions", async () => {
    const result = await runBackup(db, { dir, day: DAY, now: fixedClock });
    const file = join(dir, "harbour-2026-10-02.db");
    expect(result).toMatchObject({ name: "harbour-2026-10-02.db", kept: 1, pruned: [] });
    expect(result.bytes).toBe(statSync(file).size);
    expect(result.pages).toBeGreaterThan(0);
    expect(mode(file)).toBe(0o600);
    expect(mode(dir)).toBe(0o700);
    expect(readdirSync(dir)).toEqual(["harbour-2026-10-02.db"]);
    expect(jobCount(file)).toBe(20);
    const copy = new Database(file, { readonly: true });
    expect(copy.pragma("journal_mode", { simple: true })).toBe("delete");
    copy.close();
  });

  it("tightens an existing backup directory to 700", async () => {
    mkdirSync(dir, { mode: 0o755 });
    await runBackup(db, { dir, day: DAY, now: fixedClock });
    expect(mode(dir)).toBe(0o700);
  });

  it("still yields a verified copy when another connection writes during the backup", async () => {
    const web = new Database(join(root, "data", "harbour.db"));
    let calls = 0;
    const now = () => {
      calls += 1;
      // The progress callback reads the clock between steps: write from "the web" mid-copy.
      if (calls === 3) {
        web
          .prepare(
            "insert into jobs (kind, params, dedupe_key, status, created_at) values ('scan', '{}', 'web-write', 'queued', 0)",
          )
          .run();
      }
      return 0;
    };
    try {
      await runBackup(db, { dir, day: DAY, now, pagesPerStep: 1 });
    } finally {
      web.close();
    }
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(jobCount(join(dir, "harbour-2026-10-02.db"))).toBe(21);
  });

  it("gives up past the deadline and leaves no partial file", async () => {
    let t = 0;
    const now = () => {
      const at = t;
      t += 11 * MINUTE;
      return at;
    };
    await expect(runBackup(db, { dir, day: DAY, now, pagesPerStep: 1 })).rejects.toThrow(
      "Backup took longer than 10 minutes",
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("removes a partial left by a crashed earlier run", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "harbour-2026-10-01.db.partial"), "half a backup");
    await runBackup(db, { dir, day: DAY, now: fixedClock });
    expect(readdirSync(dir)).toEqual(["harbour-2026-10-02.db"]);
  });

  it("replaces an earlier backup of the same day", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "harbour-2026-10-02.db"), "old");
    await runBackup(db, { dir, day: DAY, now: fixedClock });
    expect(jobCount(join(dir, "harbour-2026-10-02.db"))).toBe(20);
  });

  it("keeps the newest 14 and touches nothing that is not a backup", async () => {
    mkdirSync(dir, { recursive: true });
    for (let d = 1; d <= 15; d++) {
      writeFileSync(join(dir, `harbour-2026-09-${String(d).padStart(2, "0")}.db`), "old");
    }
    writeFileSync(join(dir, "notes.txt"), "mine");
    writeFileSync(join(dir, "harbour-2026-08-01.db-wal"), "x");
    mkdirSync(join(dir, "harbour-2026-08-02.db"));
    const outside = join(root, "elsewhere.db");
    writeFileSync(outside, "not a backup");
    symlinkSync(outside, join(dir, "harbour-2026-08-03.db"));

    const result = await runBackup(db, { dir, day: DAY, now: fixedClock });

    expect(result.kept).toBe(14);
    expect(result.pruned).toEqual(["harbour-2026-09-01.db", "harbour-2026-09-02.db"]);
    expect(existsSync(join(dir, "harbour-2026-09-01.db"))).toBe(false);
    expect(existsSync(join(dir, "harbour-2026-09-03.db"))).toBe(true);
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("mine");
    expect(existsSync(join(dir, "harbour-2026-08-01.db-wal"))).toBe(true);
    expect(statSync(join(dir, "harbour-2026-08-02.db")).isDirectory()).toBe(true);
    expect(lstatSync(join(dir, "harbour-2026-08-03.db")).isSymbolicLink()).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("not a backup");
  });

  it("refuses a copy that fails its integrity check and keeps no file", async () => {
    const verify = () => ["row 3 missing from index jobs_status", "page 7: btree error"];
    await expect(runBackup(db, { dir, day: DAY, now: fixedClock, verify })).rejects.toThrow(
      "Backup failed its integrity check: row 3 missing from index jobs_status; page 7: btree error",
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("never prunes the backup it has just written, even when it is the oldest", async () => {
    mkdirSync(dir, { recursive: true });
    for (let d = 3; d <= 16; d++) {
      writeFileSync(join(dir, `harbour-2026-10-${String(d).padStart(2, "0")}.db`), "newer");
    }
    const result = await runBackup(db, { dir, day: DAY, now: fixedClock });
    expect(result.pruned).toEqual([]);
    expect(existsSync(join(dir, "harbour-2026-10-02.db"))).toBe(true);
  });

  it("stops when asked, removing the partial", async () => {
    await expect(
      runBackup(db, { dir, day: DAY, now: fixedClock, pagesPerStep: 1, shouldStop: () => true }),
    ).rejects.toBeInstanceOf(BackupStopped);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("removes leftover partials and their journal, wal and shm files, and nothing else", async () => {
    mkdirSync(dir, { recursive: true });
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      writeFileSync(join(dir, `harbour-2026-10-01.db.partial${suffix}`), "x");
    }
    mkdirSync(join(dir, "harbour-2026-09-01.db.partial"));
    writeFileSync(join(dir, "harbour-2026-09-02.db.partial-old"), "x");
    await runBackup(db, { dir, day: DAY, now: fixedClock });
    expect(readdirSync(dir).sort()).toEqual([
      "harbour-2026-09-01.db.partial",
      "harbour-2026-09-02.db.partial-old",
      "harbour-2026-10-02.db",
    ]);
  });

  it("refuses a malformed day before touching the disk", async () => {
    await expect(runBackup(db, { dir, day: "../x", now: fixedClock })).rejects.toThrow();
    expect(existsSync(dir)).toBe(false);
  });
});

describe("finaliseCopy", () => {
  it("refuses a copy it cannot switch to a single file", () => {
    const path = join(root, "wal-copy.db");
    const wal = new Database(path);
    wal.pragma("journal_mode = WAL");
    wal.exec("create table t (x)");
    wal.close();
    chmodSync(path, 0o400);
    expect(() => finaliseCopy(path)).toThrow(/could not be switched to a single file/);
  });
});
