import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { jobs } from "@/lib/db/schema";
import { gapLine, NOTE_MESSAGES, SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import type { Note } from "@/lib/explain/voice/note";
import { freshNote, readNotes } from "./read";

export type NoteView =
  | { kind: "note"; note: Note; at: Date }
  | { kind: "sample"; note: Note }
  | { kind: "gap"; line: string }
  | { kind: "unavailable"; line: string };

/** The newest daily-note job, so the button can tell when its own run is over, and how it ended. */
export type LatestRun = {
  id: number;
  status: "queued" | "running" | "ok" | "failed" | "cancelled";
};

/**
 * What the note card needs besides the note itself. `noteTime` is when the worker writes the
 * next note each day, or null when no schedule runs; `latestRun` is null when no note was ever
 * queued (and on the sample Today).
 */
export type NoteSlot = {
  view: NoteView;
  noteTime: string | null;
  tokenSet: boolean;
  latestRun: LatestRun | null;
};

function latestNoteRun(db: Db): LatestRun | null {
  const row = db
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.kind, "daily-note"))
    .orderBy(desc(jobs.id))
    .limit(1)
    .get();
  return row ?? null;
}

/**
 * What Today's note card shows (spec §4), or null when the personality is quiet. The sample
 * Today shows the fixed sample note, never a file; otherwise the newest valid note from the last
 * 24 hours, else the quiet gap. A folder that cannot be read is said so (and logged), never shown
 * as a gap; a database that cannot be read throws, for the caller's tile isolation. Read-only:
 * the web process never writes a note.
 */
export function noteSlot(input: {
  db: Db;
  personality: "warm" | "quiet";
  isSample: boolean;
  root: string;
  timeZone: string;
  noteTime: string;
  /** The worker is queueing the note by itself (the schedule is on and there is a token). */
  scheduled: boolean;
  tokenSet: boolean;
  now: Date;
}): NoteSlot | null {
  const { tokenSet } = input;
  const noteTime = input.scheduled ? input.noteTime : null;
  if (input.personality === "quiet") return null;
  const slot = (view: NoteView, latestRun: LatestRun | null = null): NoteSlot => ({
    view,
    noteTime,
    tokenSet,
    latestRun,
  });
  if (input.isSample) return slot({ kind: "sample", note: SAMPLE_NOTE });
  // Outside the folder's try: a database that can't be read is the tile's failure (the tower's
  // loadTile), never worded as a note folder problem.
  const latestRun = latestNoteRun(input.db);
  try {
    const fresh = freshNote(
      readNotes(input.db, input.root, input.timeZone, input.now, 1),
      input.now,
    );
    return slot(
      fresh
        ? { kind: "note", note: fresh.note, at: fresh.at }
        : { kind: "gap", line: gapLine(noteTime) },
      latestRun,
    );
  } catch (error) {
    console.error("could not read the daily note", error);
    return slot({ kind: "unavailable", line: NOTE_MESSAGES.unavailable });
  }
}
