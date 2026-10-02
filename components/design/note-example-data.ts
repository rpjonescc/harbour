// Fictional note cards for /design, one for every mood, view and button state the card can be in.
import type { ExampleButtonState } from "@/components/today/note/FreshNoteButton";
import { gapLine, NOTE_MESSAGES, SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import type { Note } from "@/lib/explain/voice/note";
import type { NoteSlot } from "@/lib/note/view";

const WRITTEN = new Date("2026-10-02T05:30:00Z");
const NOTE_TIME = "06:30";

const slot = (view: NoteSlot["view"], over: Partial<NoteSlot> = {}): NoteSlot => ({
  view,
  noteTime: NOTE_TIME,
  tokenSet: true,
  latestRun: null,
  ...over,
});
const written = (note: Note): NoteSlot["view"] => ({ kind: "note", at: WRITTEN, note });
const GAP = { kind: "gap", line: gapLine(NOTE_TIME) } as const;

export type ExampleNote = {
  label: string;
  slot: NoteSlot;
  /** The button's state, for the ones that need something to have happened first. */
  buttonState?: ExampleButtonState;
};

export const EXAMPLE_NOTES: ExampleNote[] = [
  {
    label: "Note · a good morning (celebrating: the wave ripples once)",
    slot: slot(
      written({
        greeting: "Morning, Sam.",
        headline: "A small step the right way.",
        body: "Acme Docs picked up a few points in Found on Google since the last check. Nothing dramatic, just the steady sort of progress that adds up. The guide for AI assistants has the most room, and it is a good place to start with your coffee.",
        picks: ["Add a short guide to your site for AI assistants"],
        mood: "celebrate",
      }),
    ),
  },
  {
    label: "Note · a weekend, with what can wait",
    slot: slot(
      written({
        greeting: "Saturday, then.",
        headline: "Nothing here needs you today.",
        body: "Your sites are in fair shape, the list is short and friendly, and the weather is doing its own thing. If you do pop in, the quick job at the top is a gentle one.",
        picks: [],
        rest: "Everything on the list will keep until Monday; the harbour will still be here.",
        mood: "steady",
      }),
    ),
  },
  {
    label: "Note · something needs a look (mood attention)",
    slot: slot(
      written({
        greeting: "Morning.",
        headline: "One hiccup, and a small one.",
        body: "The last check for Lighthouse Café didn't finish, which happens. Next step: run the check again from its page. Everything else can wait for the kettle.",
        picks: [],
        mood: "attention",
      }),
    ),
  },
  { label: "Note · no note yet today", slot: slot(GAP) },
  {
    label: "Note · no note yet today, and no schedule running",
    slot: slot({ kind: "gap", line: gapLine(null) }, { noteTime: null }),
  },
  {
    label: "Note · the note could not be read",
    slot: slot({ kind: "unavailable", line: NOTE_MESSAGES.unavailable }),
  },
  { label: "Note · the sample Today", slot: slot({ kind: "sample", note: SAMPLE_NOTE }) },
  {
    label: "Button · no Claude token, so it is switched off",
    slot: slot(GAP, { tokenSet: false }),
  },
  { label: "Button · waiting for a fresh note", slot: slot(GAP), buttonState: "waiting" },
  {
    label: "Button · asked too many times today",
    slot: slot(GAP),
    buttonState: "rate-limited",
  },
  { label: "Button · could not start a note", slot: slot(GAP), buttonState: "failed" },
  {
    label: "Button · the note did not pass the checks",
    slot: slot(GAP),
    buttonState: "rejected",
  },
];
