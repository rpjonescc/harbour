import { z } from "zod";
import { parseFile, renderFile } from "./files";

const schema = z.strictObject({ title: z.string(), n: z.number(), list: z.array(z.string()) });

describe("renderFile and parseFile", () => {
  it("round-trips frontmatter, including awkward strings, and the body", () => {
    const front = { title: 'Colons: "quotes" and # hashes', n: 3, list: ["a: b", "- c", "yes"] };
    const parsed = parseFile(renderFile(front, "Line one.\n\nLine two."), schema);
    expect(parsed).toEqual({ ok: true, value: front, body: "Line one.\n\nLine two.\n" });
  });

  it.each([
    ["no frontmatter", "just text"],
    ["invalid YAML", "---\ntitle: [unclosed\n---\nbody"],
    ["a YAML alias", "---\ntitle: &a x\nn: 1\nlist: [*a]\n---\nbody"],
    ["an unknown key", "---\ntitle: x\nn: 1\nlist: []\nextra: 1\n---\nbody"],
    ["a wrong type", "---\ntitle: x\nn: one\nlist: []\n---\nbody"],
  ])("reports %s as a reason, never a throw", (_label, text) => {
    const parsed = parseFile(text, schema);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.reason).toMatch(/\S/);
  });

  it("never repeats the file's own words in the reason", () => {
    const parsed = parseFile("---\ntitle: x\nn: 1\nlist: []\nSECRET_KEY: abc\n---\n", schema);
    expect(JSON.stringify(parsed)).not.toContain("abc");
  });
});
