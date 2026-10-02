import { SAMPLE_NOTE } from "@/lib/explain/voice/fallback";
import { makeBrain } from "@/tests/helpers/brain";
import { GOOD_NOTE, noteFileText } from "@/tests/helpers/note";
import { noteSlot } from "./view";

const NOW = new Date("2026-10-02T09:00:00Z"); // 10:00 in London
const base = (root: string, over = {}) => ({
  personality: "warm" as const,
  isSample: false,
  root,
  timeZone: "Europe/London",
  noteTime: "06:30",
  tokenSet: true,
  now: NOW,
  ...over,
});

describe("noteSlot", () => {
  it("is hidden when the personality is quiet, even with a note on disk", () => {
    const brain = makeBrain({ "notes/daily/2026-10-02-0630.md": noteFileText(GOOD_NOTE) });
    try {
      expect(noteSlot(base(brain.root, { personality: "quiet" }))).toBeNull();
    } finally {
      brain.cleanup();
    }
  });

  it("shows the fixed sample note on the sample Today, never what is on disk", () => {
    const brain = makeBrain({ "notes/daily/2026-10-02-0630.md": noteFileText(GOOD_NOTE) });
    try {
      expect(noteSlot(base(brain.root, { isSample: true }))?.view).toEqual({
        kind: "sample",
        note: SAMPLE_NOTE,
      });
    } finally {
      brain.cleanup();
    }
  });

  it("shows the newest valid note from the last 24 hours, with when it was written", () => {
    const brain = makeBrain({
      "notes/daily/2026-10-01-0630.md": noteFileText({ ...GOOD_NOTE, headline: "Old" }),
      "notes/daily/2026-10-02-0630.md": noteFileText({ ...GOOD_NOTE, headline: "Fresh" }),
    });
    try {
      const slot = noteSlot(base(brain.root));
      expect(slot).toMatchObject({ noteTime: "06:30", tokenSet: true });
      expect(slot?.view).toMatchObject({ kind: "note", note: { headline: "Fresh" } });
      expect(slot?.view.kind === "note" && slot.view.at.toISOString()).toBe(
        "2026-10-02T05:30:00.000Z",
      );
    } finally {
      brain.cleanup();
    }
  });

  it("shows the quiet gap when the newest note is older than 24 hours, or there is none", () => {
    const old = makeBrain({ "notes/daily/2026-09-30-0630.md": noteFileText(GOOD_NOTE) });
    const none = makeBrain({ "README.md": "# Brain\n" });
    try {
      for (const brain of [old, none]) {
        expect(noteSlot(base(brain.root))?.view).toEqual({
          kind: "gap",
          line: "No note yet today. The next one is written at 06:30.",
        });
      }
    } finally {
      old.cleanup();
      none.cleanup();
    }
  });

  it("never shows a note that is not valid: the gap, not the file", () => {
    const brain = makeBrain({
      "notes/daily/2026-10-02-0630.md": noteFileText({
        ...GOOD_NOTE,
        body: "See [this](https://x.example).",
      }),
    });
    try {
      expect(noteSlot(base(brain.root))?.view.kind).toBe("gap");
    } finally {
      brain.cleanup();
    }
  });

  it("says it could not read the folder, and records why, instead of showing a gap", () => {
    const brain = makeBrain({ "notes/daily": "a file where the folder should be" });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(noteSlot(base(brain.root))?.view).toEqual({
        kind: "unavailable",
        line: "Harbour couldn't read today's note. The briefing below is still up to date.",
      });
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
      brain.cleanup();
    }
  });
});
