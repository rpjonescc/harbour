// Backup file naming and listing. Reads only, so the web may use it for status.

import { lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Config } from "@/lib/config";
import { parseDay } from "@/lib/format/zoned-time";

export const BACKUPS_KEPT = 14;
export const BACKUP_NAME = /^harbour-(\d{4}-\d{2}-\d{2})\.db$/;
/** An unfinished copy, or the journal / WAL files SQLite left beside one. */
export const PARTIAL_NAME = /^harbour-(\d{4}-\d{2}-\d{2})\.db\.partial(?:-journal|-wal|-shm)?$/;

/** "harbour-2026-10-02.db"; throws unless `day` is a real YYYY-MM-DD date. */
export function backupFileName(day: string): string {
  parseDay(day);
  return `harbour-${day}.db`;
}

/** HARBOUR_BACKUP_DIR, else `<dirname(HARBOUR_DB_PATH)>/backups`, resolved absolute. */
export function backupDirFor(
  config: Pick<Config, "HARBOUR_BACKUP_DIR" | "HARBOUR_DB_PATH">,
): string {
  return resolve(config.HARBOUR_BACKUP_DIR ?? join(dirname(config.HARBOUR_DB_PATH), "backups"));
}

export type BackupFile = { name: string; day: string; bytes: number; modifiedAt: Date };

/** Regular files matching BACKUP_NAME, newest day first; [] when the directory does not exist. */
export function listBackups(dir: string): BackupFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .flatMap((name) => {
      const day = BACKUP_NAME.exec(name)?.[1];
      if (!day) return [];
      // lstat: a symlink named like a backup is not one of ours, wherever it points.
      const stat = lstatSync(join(dir, name));
      return stat.isFile() ? [{ name, day, bytes: stat.size, modifiedAt: stat.mtime }] : [];
    })
    .sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * Pure: which of `names` to delete (oldest first) so the newest `keep` matching backups remain.
 * Never a non-matching name.
 */
export function backupsToPrune(names: readonly string[], keep = BACKUPS_KEPT): string[] {
  return names
    .filter((name) => BACKUP_NAME.test(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(Math.max(0, keep))
    .reverse(); // oldest first
}
