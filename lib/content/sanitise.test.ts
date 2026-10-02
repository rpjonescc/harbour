import { sanitiseText } from "./sanitise";

const HOSTS = { allowedHosts: ["docs.example.com"] };

describe("sanitiseText", () => {
  it("normalises, strips zero-width and bidi characters and says so", () => {
    const result = sanitiseText("Cafe\u0301\u200b tips\u202e\r\nnext", "social");
    expect(result).toEqual({ ok: true, text: "Caf\u00e9 tips\nnext", stripped: true });
  });

  it("leaves clean text alone and reports nothing stripped", () => {
    expect(sanitiseText("Plain text.\n\nTwo paragraphs.", "social")).toEqual({
      ok: true,
      text: "Plain text.\n\nTwo paragraphs.",
      stripped: false,
    });
  });

  it.each([
    ["a control character", "bell\u0007"],
    ["a tab", "a\tb"],
    ["an HTML tag", "hello <b>bold</b>"],
    ["a script tag", "<script>alert(1)</script>"],
    ["a markdown image", "see ![pixel](https://attacker.example/p.png)"],
    ["a link title", 'a [link](https://docs.example.com "title")'],
    ["a code fence", "```\ncode\n```"],
    ["a tilde fence", "~~~\ncode\n~~~"],
    ["a frontmatter-like line", "text\n---\nstate: approved\n---"],
  ])("rejects %s in a social piece", (_label, text) => {
    expect(sanitiseText(text, "social").ok).toBe(false);
  });

  it("accepts the blog and website subset", () => {
    const text =
      "Intro with *emphasis* and **strong**.\n\n## A question?\n\n- one\n- two\n\n### Detail\n\n" +
      "Read the [guide](https://docs.example.com/start).";
    expect(sanitiseText(text, "markdown", HOSTS)).toMatchObject({ ok: true, stripped: false });
  });

  it.each([
    ["a link to another host", "[x](https://attacker.example/)"],
    ["a relative link", "[x](/start)"],
    ["a javascript link", "[x](javascript:alert(1))"],
    ["an h1", "# Title"],
    ["an h4", "#### Deep"],
    ["a blockquote", "> quoted"],
    ["a table", "| a | b |\n|---|---|"],
    ["an image", "![x](https://docs.example.com/x.png)"],
    ["an HTML tag", "<div>x</div>"],
  ])("rejects %s in markdown", (_label, text) => {
    expect(sanitiseText(text, "markdown", HOSTS).ok).toBe(false);
  });
});
