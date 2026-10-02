import { factsInput } from "@/tests/helpers/note";
import { checkNote, toneProblem } from "./check";
import { buildFacts } from "./facts";
import { gapLine, NOTE_MESSAGES, SAMPLE_NOTE } from "./fallback";
import { noteSchema } from "./note";

describe("the fixed texts", () => {
  it("say what is missing and when the next note comes", () => {
    expect(gapLine("06:30")).toBe("No note yet today. The next one is written at 06:30.");
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
