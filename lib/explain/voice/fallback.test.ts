import { factsInput } from "@/tests/helpers/note";
import { checkNote, toneProblem } from "./check";
import { buildFacts } from "./facts";
import { gapLine, NOTE_MESSAGES, NOTE_RUN_FAILED_LINE, SAMPLE_NOTE } from "./fallback";
import { noteSchema } from "./note";

describe("the fixed texts", () => {
  it("say what is missing and when the next note comes", () => {
    expect(gapLine("06:30")).toBe("No note yet today. The next one is written at 06:30.");
  });

  it("do not promise a schedule that is not running", () => {
    expect(gapLine(null)).toBe("No note yet today.");
    expect(NOTE_MESSAGES.rateLimited(null)).toBe(
      "That's plenty of notes for one day. You can ask again tomorrow.",
    );
    expect(NOTE_MESSAGES.rateLimited(null)).not.toMatch(/written at/);
  });

  it("keep the same tone rules as the agent's notes", () => {
    const texts = [
      gapLine("06:30"),
      NOTE_MESSAGES.writing,
      NOTE_MESSAGES.slow,
      NOTE_MESSAGES.failed,
      NOTE_MESSAGES.noToken,
      NOTE_MESSAGES.unavailable,
      NOTE_MESSAGES.rateLimited("06:30"),
      NOTE_MESSAGES.rateLimited(null),
      NOTE_MESSAGES.rejected,
      NOTE_MESSAGES.starting,
      NOTE_RUN_FAILED_LINE,
      gapLine(null),
      SAMPLE_NOTE.greeting,
      SAMPLE_NOTE.headline,
      SAMPLE_NOTE.body,
    ];
    for (const text of texts) expect(toneProblem(text)).toBeNull();
  });

  it("make the sample note a valid note that passes the checker against empty facts", () => {
    expect(noteSchema.parse(SAMPLE_NOTE)).toEqual(SAMPLE_NOTE);
    const empty = buildFacts(factsInput({ products: [], actions: [], finishedTitles: [] }));
    expect(checkNote(SAMPLE_NOTE, empty)).toBeNull();
  });
});
