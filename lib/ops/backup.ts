// The nightly backup: online copy → verify → rename into place → prune. Worker only.

import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { connectionOf, type Db } from "@/lib/db/client";
import {
  BACKUP_NAME,
  backupFileName,
  backupsToPrune,
  listBackups,
  PARTIAL_NAME,
} from "./backup-files";

const MINUTE_MS = 60_000;

export type BackupResult = {
  name: string;
  bytes: number;
  pages: number;
  ms: number;
  kept: number;
  pruned: string[];
  /** Why pruning failed after the backup was kept; the backup itself still stands. */
  pruneError: string | null;
};

export type BackupOptions = {
  dir: string;
  day: string;
  now: () => number;
  /** Wall-clock limit; the copy is abandoned past it. Default 10 minutes. */
  deadlineMs?: number;
  /** Pages copied per step; the event loop runs between steps. Default 256. */
  pagesPerStep?: number;
  /** Checked between steps: true abandons the copy with BackupStopped (cancel or worker stop). */
  shouldStop?: () => boolean;
  /** Test seam: finalises the copy and returns its integrity_check rows. */
  verify?: (path: string) => string[];
};

/** The copy was abandoned because the job was cancelled or the worker is stopping. */
export class BackupStopped extends Error {
  constructor() {
    super("Cancelled");
    this.name = "BackupStopped";
  }
}

/**
 * Makes the copy one self-contained file (it carries the source's WAL flag, and a restore must
 * not need `-wal`/`-shm` files) and returns its integrity_check rows: exactly ["ok"] when sound.
 */
export function finaliseCopy(path: string): string[] {
  const copy = new Database(path);
  try {
    let mode: unknown;
    try {
      mode = copy.pragma("journal_mode = DELETE", { simple: true });
    } catch (error) {
      mode = error instanceof Error ? error.message : String(error);
    }
    if (mode !== "delete") {
      throw new Error(`Backup could not be switched to a single file (${String(mode)})`);
    }
    // Synchronous and outside the copy's deadline: it reads the whole file once, which is
    // bounded by the database size and blocks the worker (not the web) meanwhile.
    const rows = copy.pragma("integrity_check") as { integrity_check: string }[];
    return rows.map((row) => row.integrity_check);
  } finally {
    copy.close();
  }
}

/** Only regular files whose names match `pattern` — never through a symlink, never anything else. */
function removeIfOurs(dir: string, name: string, pattern: RegExp): boolean {
  if (!pattern.test(name)) return false;
  const path = join(dir, name);
  if (!lstatSync(path).isFile()) return false;
  unlinkSync(path);
  return true;
}

/** Unfinished copies of earlier (crashed) or failed runs, with their journal files. */
function removePartials(dir: string): void {
  for (const name of readdirSync(dir)) removeIfOurs(dir, name, PARTIAL_NAME);
}

/** Keeps the newest backups; never the one just written (`keep`), even if it is the oldest. */
function prune(dir: string, keep: string): string[] {
  return backupsToPrune(listBackups(dir).map((f) => f.name))
    .filter((name) => name !== keep)
    .filter((name) => removeIfOurs(dir, name, BACKUP_NAME));
}

/** Copies the live database into `<dir>/harbour-<day>.db`, verified, then keeps the newest 14. */
export async function runBackup(db: Db, opts: BackupOptions): Promise<BackupResult> {
  const { dir, day, now, deadlineMs = 10 * MINUTE_MS, pagesPerStep = 256 } = opts;
  const verify = opts.verify ?? finaliseCopy;
  const shouldStop = opts.shouldStop ?? (() => false);
  const name = backupFileName(day); // validates `day` before anything touches the disk
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdir's mode only applies to new directories; tighten one that already existed too.
  chmodSync(dir, 0o700);
  removePartials(dir);

  const partial = join(dir, `${name}.partial`);
  const final = join(dir, name);
  const started = now();
  let pages: number;
  try {
    // Created private before any byte is copied; "wx" refuses anything already at that path.
    closeSync(openSync(partial, "wx", 0o600));
    // Steps run on setImmediate, so the event loop stays responsive; a write by another
    // connection restarts the copy at the next step, which the deadline bounds.
    const progress = await connectionOf(db).backup(partial, {
      progress: () => {
        if (shouldStop()) throw new BackupStopped();
        if (now() - started > deadlineMs) {
          throw new Error(`Backup took longer than ${Math.round(deadlineMs / MINUTE_MS)} minutes`);
        }
        return pagesPerStep;
      },
    });
    pages = progress.totalPages;
    chmodSync(partial, 0o600);
    const rows = verify(partial);
    if (rows.length !== 1 || rows[0] !== "ok") {
      throw new Error(`Backup failed its integrity check: ${rows.slice(0, 3).join("; ")}`);
    }
    renameSync(partial, final); // atomic; replaces an earlier backup of the same day
  } catch (error) {
    try {
      removePartials(dir);
    } catch {
      // Best effort: the original error is what matters, and the next run removes the partial.
    }
    throw error;
  }
  const ms = now() - started;
  const bytes = statSync(final).size;
  let pruned: string[] = [];
  let pruneError: string | null = null;
  try {
    pruned = prune(dir, name);
  } catch (error) {
    pruneError = error instanceof Error ? error.message : String(error);
  }
  return { name, bytes, pages, ms, kept: listBackups(dir).length, pruned, pruneError };
}
