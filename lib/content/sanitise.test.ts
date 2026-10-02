import { PIECES } from "@/tests/helpers/content";
import { sanitiseContent, sanitiseText } from "./sanitise";

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

describe("sanitiseText hostile input", () => {
  it.each([
    ["Unicode tag characters", "a\u{e0041}b"],
    ["a line separator", "a\u2028b"],
    ["an Arabic letter mark", "a\u061cb"],
    ["a variation selector", "a\ufe0fb"],
    ["a zero-width joiner", "a\u200db"],
  ])("strips %s and says so", (_label, text) => {
    expect(sanitiseText(text, "social")).toEqual({ ok: true, text: "ab", stripped: true });
  });

  it("strips before normalising, so a hidden character cannot split a sequence", () => {
    expect(sanitiseText("e\u200b\u0301", "social")).toEqual({
      ok: true,
      text: "\u00e9",
      stripped: true,
    });
  });

  it("rejects a C1 control character", () => {
    expect(sanitiseText("a\u0085b", "social").ok).toBe(false);
  });

  it.each([
    ["an indented heading", "   # Title"],
    ["a spaced link", "[x]( https://attacker.example/ )"],
    ["an angle-bracket link", "[x](<https://attacker.example/>)"],
    ["a reference link", "[x]: https://attacker.example/"],
    ["a bare URL", "see https://attacker.example/ now"],
    ["an unterminated tag", "<script src=x"],
    ["a processing instruction", "<?php echo 1"],
    ["a doctype", "<!DOCTYPE html"],
  ])("rejects %s in markdown", (_label, text) => {
    expect(sanitiseText(text, "markdown", HOSTS).ok).toBe(false);
  });

  it("rejects an unterminated tag in a social piece", () => {
    expect(sanitiseText("<script src=x", "social").ok).toBe(false);
  });

  it("accepts spaced, reference and bare links to an allowed host", () => {
    const text =
      "[a]( https://docs.example.com/a )\n\n[b]: https://docs.example.com/b\n\nSee https://docs.example.com/c.";
    expect(sanitiseText(text, "markdown", HOSTS).ok).toBe(true);
  });
});

describe("sanitiseContent", () => {
  const hosts = ["docs.example.com"];
  it("passes a clean piece unchanged and strips hidden characters from any field, reporting it", () => {
    expect(sanitiseContent("linkedin", PIECES.linkedin, hosts)).toMatchObject({
      ok: true,
      stripped: false,
    });
    const dirty = sanitiseContent(
      "linkedin",
      { ...PIECES.linkedin, text: "Hi\u200b there" },
      hosts,
    );
    expect(dirty).toMatchObject({ ok: true, stripped: true, content: { text: "Hi there" } });
    const tag = sanitiseContent("linkedin", { text: "a", hashtags: ["#d\u202eocs"] }, hosts);
    expect(tag).toMatchObject({ ok: true, stripped: true, content: { hashtags: ["#docs"] } });
  });

  it("lets only the blog body be markdown, and only with links to the product's own site", () => {
    const blog = (body: string) => ({ ...PIECES.blog, body });
    expect(
      sanitiseContent("blog", blog("## Q?\n\nSee [guide](https://docs.example.com/x)."), hosts).ok,
    ).toBe(true);
    expect(sanitiseContent("blog", blog("[x](https://attacker.example/)"), hosts).ok).toBe(false);
    expect(
      sanitiseContent("blog", { ...PIECES.blog, answer: "## Heading\n> quote" }, hosts).ok,
    ).toBe(true);
    expect(sanitiseContent("linkedin", { ...PIECES.linkedin, text: "## Heading" }, hosts).ok).toBe(
      true,
    );
  });

  it("allows a link to the product's own site in a plain piece and refuses any other host", () => {
    const link = (text: string) => sanitiseContent("facebook", { text, hashtags: [] }, hosts).ok;
    expect(link("Read it at https://docs.example.com/start")).toBe(true);
    expect(link("Read it at https://www.docs.example.com/start")).toBe(true);
    expect(link("Read it at https://attacker.example/start")).toBe(false);
    expect(link("Read it at https://docs.example.com.attacker.example/")).toBe(false);
    expect(link("[x](javascript:alert(1))")).toBe(false);
  });

  it.each([
    ["an image beacon", { ...PIECES.blog, body: "![x](https://docs.example.com/p.png)" }, "blog"],
    ["HTML in a plain piece", { ...PIECES.facebook, text: "<img src=x>" }, "facebook"],
    ["HTML in a blog answer", { ...PIECES.blog, answer: "<b>hi</b>" }, "blog"],
    ["a code fence in an X post", { posts: ["```\nx\n```"], hashtags: [] }, "x"],
    ["a control character", { ...PIECES.linkedin, text: "a\u0007b" }, "linkedin"],
  ] as const)("rejects %s", (_label, content, platform) => {
    expect(sanitiseContent(platform, content, hosts).ok).toBe(false);
  });

  it("never repeats the rejected text in its reason", () => {
    const result = sanitiseContent("facebook", { text: "<img src=SECRET>", hashtags: [] }, hosts);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
