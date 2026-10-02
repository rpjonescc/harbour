import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBrain } from "@/tests/helpers/brain";
import { GOOD_NOTE, noteFileText } from "@/tests/helpers/note";
import { freshNote, readNotes } from "./read";

const NOW = new Date("2026-10-02T09:00:00Z"); // 10:00 in London (BST)
const ZONE = "Europe/London";
const file = (stamp: string, headline = "Headline") =>
  [`notes/daily/${stamp}.md`, noteFileText({ ...GOOD_NOTE, headline })] as const;

describe("readNotes", () => {
  it("lists valid notes newest first, with the instant their stamp names", () => {
    const brain = makeBrain(
      Object.fromEntries([file("2026-10-01-0630", "Old"), file("2026-10-02-0630", "New")]),
    );
    try {
      const notes = readNotes(brain.root, ZONE, NOW, 5);
      expect(notes.map((n) => [n.stamp, n.note.headline])).toEqual([
        ["2026-10-02-0630", "New"],
        ["2026-10-01-0630", "Old"],
      ]);
      expect(notes[0]?.at.toISOString()).toBe("2026-10-02T05:30:00.000Z");
      expect(readNotes(brain.root, ZONE, NOW, 1)).toHaveLength(1);
    } finally {
      brain.cleanup();
    }
  });

  it("is empty when the folder does not exist yet", () => {
    const brain = makeBrain({ "README.md": "# Brain\n" });
    try {
      expect(readNotes(brain.root, ZONE, NOW, 5)).toEqual([]);
    } finally {
      brain.cleanup();
    }
  });

  it("never returns a corrupt, oversized, mis-named, symlinked or future-dated note", () => {
    const brain = makeBrain({
      ...Object.fromEntries([file("2026-10-02-0630", "Good")]),
      "notes/daily/2026-10-02-0600.md": "not a note",
      "notes/daily/2026-10-02-0500.md": `---\n---\n${"a".repeat(9000)}`,
      "notes/daily/draft.md": noteFileText(GOOD_NOTE),
      "notes/daily/2026-10-02-0700.md": noteFileText({ ...GOOD_NOTE, body: "Some **markdown**." }),
      ...Object.fromEntries([file("2026-10-03-0630", "Tomorrow")]),
    });
    try {
      symlinkSync(
        join(brain.root, "notes/daily/2026-10-02-0630.md"),
        join(brain.root, "notes/daily/2026-10-02-0645.md"),
      );
      expect(readNotes(brain.root, ZONE, NOW, 10).map((n) => n.note.headline)).toEqual(["Good"]);
    } finally {
      brain.cleanup();
    }
  });

  it("looks at only the newest files, however many pile up", () => {
    const brain = makeBrain({});
    try {
      mkdirSync(join(brain.root, "notes/daily"), { recursive: true });
      for (let day = 1; day <= 31; day++) {
        const stamp = `2026-08-${String(day).padStart(2, "0")}-0630`;
        writeFileSync(join(brain.root, `notes/daily/${stamp}.md`), noteFileText(GOOD_NOTE));
      }
      expect(readNotes(brain.root, ZONE, NOW, 100)).toHaveLength(30);
    } finally {
      brain.cleanup();
    }
  });

  it("propagates a real read error instead of pretending there are no notes", () => {
    const brain = makeBrain({ "notes/daily": "this is a file, not a folder" });
    try {
      expect(() => readNotes(brain.root, ZONE, NOW, 5)).toThrow();
    } finally {
      brain.cleanup();
    }
  });
});

describe("freshNote", () => {
  const shown = (stamp: string, at: string) => ({ stamp, at: new Date(at), note: GOOD_NOTE });

  it("is the newest note from the last 24 hours, else null", () => {
    const recent = shown("2026-10-02-0630", "2026-10-02T05:30:00Z");
    const old = shown("2026-10-01-0630", "2026-10-01T05:30:00Z");
    expect(freshNote([recent, old], NOW)).toBe(recent);
    expect(freshNote([old], NOW)).toBeNull();
    expect(freshNote([], NOW)).toBeNull();
  });

  it("counts exactly 24 hours as still fresh", () => {
    const edge = shown("2026-10-01-1000", "2026-10-01T09:00:00Z");
    expect(freshNote([edge], NOW)).toBe(edge);
  });
});
