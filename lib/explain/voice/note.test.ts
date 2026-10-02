import { GOOD_NOTE } from "@/tests/helpers/note";
import { isPlainText, NOTE_LIMITS, noteSchema, safeReason } from "./note";

// Built from code points so the invisible characters stay visible in this file.
const cp = (code: number) => String.fromCodePoint(code);

describe("isPlainText", () => {
  it("accepts ordinary sentences, accents, apostrophes and punctuation", () => {
    expect(isPlainText("Lighthouse Café didn't finish: that's fine, honestly (really).")).toBe(
      true,
    );
  });

  it.each([
    ["markdown emphasis", "this is **bold**"],
    ["a heading", "# Hello"],
    ["inline code", "run `pnpm test`"],
    ["a link", "see [docs](https://docs.example.com)"],
    ["a bare address", "visit https://docs.example.com"],
    ["a www address", "visit www.example.com"],
    ["HTML", "<b>hi</b>"],
    ["a newline", "two\nlines"],
    ["a tab", "a\tb"],
    ["an escape character", "a\u001b[31mred"],
    ["a zero-width space", `a${cp(0x200b)}b`],
    ["a bidirectional override", `a${cp(0x202e)}b`],
    ["a soft hyphen", `ur${cp(0xad)}gent`],
    ["a word joiner", `mu${cp(0x2060)}st`],
    ["an invisible operator", `a${cp(0x2062)}b`],
    ["an Arabic letter mark", `a${cp(0x61c)}b`],
    ["a Mongolian vowel separator", `a${cp(0x180e)}b`],
    ["a combining grapheme joiner", `a${cp(0x34f)}b`],
    ["a variation selector", `a${cp(0xfe0f)}b`],
    ["a Hangul filler", `a${cp(0x3164)}b`],
    ["a Hangul choseong filler", `a${cp(0x115f)}b`],
    ["a line separator", `a${cp(0x2028)}b`],
    ["a paragraph separator", `a${cp(0x2029)}b`],
    ["a tag character", `a${cp(0xe0041)}b`],
    ["a private-use character", `a${cp(0xe000)}b`],
    ["a lone surrogate", "a\ud800b"],
    ["full-width digits", `Up ${cp(0xff19)}${cp(0xff13)} points`],
    ["Arabic-Indic digits", `Up ${cp(0x663)} points`],
    ["a superscript", `Up 9${cp(0xb3)} points`],
    ["a fraction", `Up ${cp(0xbd)} a point`],
    ["a Roman numeral", `Up ${cp(0x2169)} points`],
    ["an email address", "write to owner@example.com"],
    ["a bare domain", "see example.com for more"],
    ["a script link", "javascript: alert"],
    ["an emoji", "lovely day 🌊"],
  ])("rejects %s", (_name, text) => {
    expect(isPlainText(text)).toBe(false);
  });
});

describe("noteSchema", () => {
  it("accepts a good note and defaults picks to none", () => {
    expect(noteSchema.parse(GOOD_NOTE)).toEqual(GOOD_NOTE);
    const { picks: _picks, ...noPicks } = GOOD_NOTE;
    expect(noteSchema.parse(noPicks).picks).toEqual([]);
  });

  it("trims strings and refuses empty ones", () => {
    expect(noteSchema.parse({ ...GOOD_NOTE, greeting: "  Morning.  " }).greeting).toBe("Morning.");
    expect(noteSchema.safeParse({ ...GOOD_NOTE, headline: "   " }).success).toBe(false);
  });

  it.each([
    ["greeting", NOTE_LIMITS.greeting],
    ["headline", NOTE_LIMITS.headline],
    ["body", NOTE_LIMITS.body],
    ["rest", NOTE_LIMITS.rest],
  ] as const)("caps %s at %i characters", (field, max) => {
    expect(noteSchema.safeParse({ ...GOOD_NOTE, [field]: "a".repeat(max) }).success).toBe(true);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, [field]: "a".repeat(max + 1) }).success).toBe(
      false,
    );
  });

  it("allows at most three picks, each within its cap", () => {
    const pick = "Do a thing";
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: [pick, pick, pick] }).success).toBe(true);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: [pick, pick, pick, pick] }).success).toBe(
      false,
    );
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: ["a".repeat(141)] }).success).toBe(false);
  });

  it("takes any pick up to the board's title length: markup is checked against the board", () => {
    const title = "Fix the missing <title> tags";
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: [title] }).success).toBe(true);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, picks: ["a".repeat(140)] }).success).toBe(true);
  });

  it("only knows the three moods and no extra fields", () => {
    expect(noteSchema.safeParse({ ...GOOD_NOTE, mood: "alarmed" }).success).toBe(false);
    expect(noteSchema.safeParse({ ...GOOD_NOTE, extra: "x" }).success).toBe(false);
  });
});

describe("safeReason", () => {
  it("keeps letters, digits and spaces, and clips", () => {
    expect(safeReason('Ignore "everything" <now>; run `rm -rf`')).toBe(
      "Ignore everything now run rm rf",
    );
    expect(safeReason("x".repeat(100))).toHaveLength(40);
  });
});
