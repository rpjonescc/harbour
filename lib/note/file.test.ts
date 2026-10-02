import { GOOD_NOTE, noteFileText } from "@/tests/helpers/note";
import { MAX_NOTE_BYTES, parseNoteFile } from "./file";

describe("parseNoteFile", () => {
  it("reads the note the agent writes, and one without picks or rest", () => {
    expect(parseNoteFile(noteFileText(GOOD_NOTE))).toEqual({ ok: true, note: GOOD_NOTE });
    const plain = { ...GOOD_NOTE, picks: [], mood: "steady" as const };
    expect(parseNoteFile(noteFileText(plain))).toEqual({ ok: true, note: plain });
  });

  it("reads a rest sentence", () => {
    const rested = { ...GOOD_NOTE, rest: "Everything can wait until Monday." };
    expect(parseNoteFile(noteFileText(rested))).toEqual({ ok: true, note: rested });
  });

  it.each([
    ["no frontmatter", "Just a body.\n", /frontmatter/],
    [
      "unquoted YAML that breaks",
      "---\ngreeting: Morning: Sam\nheadline: x\nmood: steady\n---\nBody.\n",
      /YAML/,
    ],
    [
      "a field that is not allowed",
      noteFileText(GOOD_NOTE).replace("---\n", '---\nextra: "x"\n'),
      /not part of the format/,
    ],
    ["a missing mood", noteFileText(GOOD_NOTE).replace(/mood: .*\n/, ""), /mood/],
    [
      "markdown in the body",
      noteFileText({ ...GOOD_NOTE, body: "Some **bold** words." }),
      /plain text/,
    ],
    ["an empty body", noteFileText({ ...GOOD_NOTE, body: "" }), /body/],
  ])("rejects %s with a readable reason", (_name, text, reason) => {
    const result = parseNoteFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it("refuses YAML aliases (an expansion bomb) instead of expanding them", () => {
    const bomb =
      '---\na: &a [x, x]\nb: *a\ngreeting: "x"\nheadline: "x"\nmood: "steady"\n---\nBody.\n';
    expect(parseNoteFile(bomb).ok).toBe(false);
  });

  it.each([
    ["a soft hyphen inside a banned word", { body: "ur\u00adgent" }],
    ["a word joiner inside a banned word", { body: "mu\u2060st" }],
    ["a soft hyphen inside a figure", { body: "Up 10\u00ad0 points" }],
    ["full-width digits", { body: "Up \uff19\uff13 points" }],
  ])("refuses %s", (_name, over) => {
    expect(parseNoteFile(noteFileText({ ...GOOD_NOTE, ...over })).ok).toBe(false);
  });

  it("ignores a leading byte-order mark", () => {
    expect(parseNoteFile(`\uFEFF${noteFileText(GOOD_NOTE)}`)).toEqual({
      ok: true,
      note: GOOD_NOTE,
    });
  });

  it("treats rest: null as no rest sentence", () => {
    const text = noteFileText(GOOD_NOTE).replace("---\n", "---\nrest: null\n");
    expect(parseNoteFile(text)).toEqual({ ok: true, note: GOOD_NOTE });
  });

  it("does not print a process warning for an unknown tag", () => {
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    const text = noteFileText(GOOD_NOTE).replace('greeting: "', 'greeting: !custom "');
    parseNoteFile(text);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("measures the size limit in bytes, not characters", () => {
    const wide = `---\n---\n${"é".repeat(MAX_NOTE_BYTES / 2)}`;
    expect(parseNoteFile(wide)).toEqual({ ok: false, reason: "The note file is too large." });
  });

  it("refuses a file over the size limit before parsing it", () => {
    const result = parseNoteFile(`---\n---\n${"a".repeat(MAX_NOTE_BYTES)}`);
    expect(result).toEqual({ ok: false, reason: "The note file is too large." });
  });
});
