import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import type { Note } from "@/lib/explain/voice/note";
import { noteDigest } from "./digest";
import { MAX_NOTE_BYTES, parseNoteFile } from "./file";
import { isNoteStamp, NOTE_DIR, stampInstant } from "./stamp";

export type ShownNote = { stamp: string; at: Date; note: Note };

/** The newest files looked at: bounds the work however many notes pile up. */
const SCAN_LIMIT = 30;
/** The recent succeeded note jobs looked at: bounds the query, covers the files scanned. */
const JOB_LIMIT = 200;
const DAY_MS = 24 * 60 * 60_000;
/** A note stamped a little ahead of the clock is fine; one from tomorrow is not. */
const SKEW_MS = 5 * 60_000;

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

function stampsNewestFirst(root: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(root, NOTE_DIR));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error; // an unreadable folder is a real problem, not "no notes"
  }
  return names
    .filter((name) => name.endsWith(".md") && isNoteStamp(name.slice(0, -3)))
    .map((name) => name.slice(0, -3))
    .sort()
    .reverse()
    .slice(0, SCAN_LIMIT);
}

/**
 * One file's note, or null when it is not a small regular file holding a valid note whose bytes
 * are the ones the worker checked (`digests`): an edit after the check hides the file.
 */
function readOne(root: string, stamp: string, digests: ReadonlySet<string>): Note | null {
  const file = join(root, NOTE_DIR, `${stamp}.md`);
  try {
    const stats = lstatSync(file); // lstat: a symlink is never followed
    if (!stats.isFile() || stats.size > MAX_NOTE_BYTES) return null;
    const bytes = readFileSync(file);
    if (!digests.has(noteDigest(bytes))) return null;
    const parsed = parseNoteFile(bytes.toString("utf8"));
    return parsed.ok ? parsed.note : null;
  } catch (error) {
    if (isMissing(error)) return null; // removed between listing and reading
    throw error;
  }
}

/**
 * What the worker accepted, per stamp: the digests of the note bytes its succeeded daily-note
 * jobs stored. A succeeded job exists only once the checker passed the note and it was
 * committed. The agent can write any file in the brain, and edit one it has Read, but it cannot
 * write the jobs table: so a file is shown only while it is byte for byte what was checked.
 */
function acceptedDigests(db: Db): Map<string, Set<string>> {
  const rows = db
    .select({ params: jobs.params, result: jobs.result })
    .from(jobs)
    .where(and(eq(jobs.kind, "daily-note"), eq(jobs.status, "ok")))
    .orderBy(desc(jobs.id))
    .limit(JOB_LIMIT)
    .all();
  const accepted = new Map<string, Set<string>>();
  for (const { params, result } of rows) {
    if (!params.stamp || !result) continue; // no digest: nothing vouches for any bytes
    const set = accepted.get(params.stamp) ?? new Set<string>();
    accepted.set(params.stamp, set.add(result));
  }
  return accepted;
}

/**
 * The published notes in the brain, newest first (at most `limit`). The web process only reads.
 * A file is shown only when a succeeded job vouches for its stamp and its bytes (so never a
 * stray file, a hand-written or edited one, or one whose job is still running or failed), and it
 * is still re-validated here: a file that is not a small regular file holding a valid note is
 * skipped.
 */
export function readNotes(
  db: Db,
  root: string,
  timeZone: string,
  now: Date,
  limit: number,
): ShownNote[] {
  const notes: ShownNote[] = [];
  const accepted = acceptedDigests(db);
  for (const stamp of stampsNewestFirst(root)) {
    if (notes.length >= limit) break;
    const digests = accepted.get(stamp);
    if (!digests) continue;
    const at = stampInstant(stamp, timeZone);
    if (at.getTime() > now.getTime() + SKEW_MS) continue;
    const note = readOne(root, stamp, digests);
    if (note) notes.push({ stamp, at, note });
  }
  return notes;
}

/** The newest note written in the last 24 hours (spec §3.2), or null. */
export function freshNote(notes: readonly ShownNote[], now: Date): ShownNote | null {
  return notes.find((n) => now.getTime() - n.at.getTime() <= DAY_MS) ?? null;
}
