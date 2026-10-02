import type { Db } from "@/lib/db/client";
import { gapLine, NOTE_MESSAGES, SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import type { Note } from "@/lib/explain/voice/note";
import { freshNote, readNotes } from "./read";

export type NoteView =
  | { kind: "note"; note: Note; at: Date }
  | { kind: "sample"; note: Note }
  | { kind: "gap"; line: string }
  | { kind: "unavailable"; line: string };

/** What the note card needs besides the note itself. */
export type NoteSlot = { view: NoteView; noteTime: string; tokenSet: boolean };

/**
 * What Today's note card shows (spec §4), or null when the personality is quiet. The sample
 * Today shows the fixed sample note, never a file; otherwise the newest valid note from the last
 * 24 hours, else the quiet gap. A folder that cannot be read is said so (and logged), never shown
 * as a gap. Read-only: the web process never writes a note.
 */
export function noteSlot(input: {
  db: Db;
  personality: "warm" | "quiet";
  isSample: boolean;
  root: string;
  timeZone: string;
  noteTime: string;
  tokenSet: boolean;
  now: Date;
}): NoteSlot | null {
  const { noteTime, tokenSet } = input;
  if (input.personality === "quiet") return null;
  const slot = (view: NoteView): NoteSlot => ({ view, noteTime, tokenSet });
  if (input.isSample) return slot({ kind: "sample", note: SAMPLE_NOTE });
  try {
    const fresh = freshNote(
      readNotes(input.db, input.root, input.timeZone, input.now, 1),
      input.now,
    );
    return slot(
      fresh
        ? { kind: "note", note: fresh.note, at: fresh.at }
        : { kind: "gap", line: gapLine(noteTime) },
    );
  } catch (error) {
    console.error("could not read the daily note", error);
    return slot({ kind: "unavailable", line: NOTE_MESSAGES.unavailable });
  }
}
