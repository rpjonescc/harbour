import type { Note } from "./note";

/**
 * Today's quiet gap: no valid note in the last 24 hours. `noteTime` is when the worker writes the
 * next one, or null when no schedule runs (switched off, or no Claude token): then none is
 * promised.
 */
export function gapLine(noteTime: string | null): string {
  return noteTime === null
    ? "No note yet today."
    : `No note yet today. The next one is written at ${noteTime}.`;
}

/** The fixed note the sample Today shows, always labelled as a sample (spec §4). */
export const SAMPLE_NOTE: Note = {
  greeting: "Good morning.",
  headline: "A calm start, with room to grow.",
  body:
    "This is what a note from Harbour looks like. Once your first check finishes, a fresh one is " +
    "written each morning from your real results, saying plainly what is going well and what is " +
    "worth doing next.",
  picks: [],
  mood: "steady",
};

/** Words for the "Write me a fresh one" button and the card's rare states. */
export const NOTE_MESSAGES = {
  writing: "Writing a fresh one now. It should appear here in a minute or two.",
  slow: "Still waiting for the worker. You can follow the run on the Agents page.",
  failed: "Harbour couldn't start a note just now. Try again in a moment.",
  starting: "Starting…",
  rejected: "That note didn't pass Harbour's checks, so nothing was shown. You can try again.",
  noToken: "Notes need Claude to be connected. The setup steps are on the Agents page.",
  unavailable: "Harbour couldn't read today's note. Everything else on this page is up to date.",
  rateLimited: (noteTime: string | null) =>
    noteTime === null
      ? "That's plenty of notes for one day. You can ask again tomorrow."
      : `That's plenty of notes for one day. Tomorrow's is written at ${noteTime}.`,
} as const;

/** A daily note is asked for on Today, not on the Agents page. */
export const NOTE_RUN_FAILED_LINE =
  "This note didn't get written. You can ask for a fresh one on Today.";
