import { renderMarkdown, stripLeadingTitle } from "./render";
import { buildLinkIndex } from "./wikilinks";

const index = buildLinkIndex(["research/glossary.md"]);

describe("renderMarkdown", () => {
  it("strips scripts, event handlers, inline styles and iframes", async () => {
    const { html } = await renderMarkdown(
      [
        "<script>alert(1)</script>",
        '<p onclick="steal()" style="color:red">hi</p>',
        '<iframe src="https://example.com"></iframe>',
      ].join("\n\n"),
      index,
    );
    expect(html).not.toMatch(/<script|onclick|style=|<iframe/);
  });

  it("turns resolved wiki-links into brain links and reports them", async () => {
    const { html, links } = await renderMarkdown("See [[glossary|the glossary]].", index);
    expect(html).toContain(
      '<a href="/brain/research/glossary.md" class="wikilink">the glossary</a>',
    );
    expect(links).toEqual(["research/glossary.md"]);
  });

  it("keeps unresolved wiki-links visible as broken", async () => {
    const { html } = await renderMarkdown("See [[nowhere]].", index);
    expect(html).toMatch(
      /<span class="wikilink-broken" title="No document named “nowhere”">nowhere<\/span>/,
    );
  });

  it("opens external links in a new tab safely", async () => {
    const { html } = await renderMarkdown("[site](https://example.com)", index);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("replaces images with links instead of loading them", async () => {
    const { html } = await renderMarkdown("![chart](https://example.com/c.png)", index);
    expect(html).not.toContain("<img");
    expect(html).toContain('<a href="https://example.com/c.png"');
    expect(html).toContain("Image: chart");
  });

  it("builds an outline from h2 and h3 with stable ids", async () => {
    const { html, outline } = await renderMarkdown("## Signals that matter\n\n### Mentions", index);
    expect(outline).toEqual([
      { id: "h-signals-that-matter", text: "Signals that matter", depth: 2 },
      { id: "h-mentions", text: "Mentions", depth: 3 },
    ]);
    expect(html).toContain('<h2 id="h-signals-that-matter">');
  });

  it("prefixes heading ids so they cannot collide with app ids", async () => {
    const { html } = await renderMarkdown("## main", index);
    expect(html).toContain('<h2 id="h-main">');
  });

  it("points same-page author anchors at the prefixed heading ids", async () => {
    const { html } = await renderMarkdown("## Intro\n\nBack to [intro](#intro).", index);
    expect(html).toContain('<a href="#h-intro">intro</a>');
  });

  it("links footnotes to ids that exist and keeps them out of the outline", async () => {
    const { html, outline } = await renderMarkdown(
      "## Intro\n\nA note[^1].\n\n[^1]: The note.",
      index,
    );
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    const targets = [...html.matchAll(/ href="#([^"]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThanOrEqual(2);
    for (const target of targets) expect(ids).toContain(target);
    expect(html).not.toContain("user-content-user-content");
    expect(outline).toEqual([{ id: "h-intro", text: "Intro", depth: 2 }]);
  });

  it("renders GitHub-flavoured tables", async () => {
    const { html } = await renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |", index);
    expect(html).toContain("<table>");
  });
});

describe("stripLeadingTitle", () => {
  it("removes a first heading that repeats the title", () => {
    expect(stripLeadingTitle("# Alpha\n\nText", "Alpha")).toBe("Text");
    expect(stripLeadingTitle("\n# Alpha\nText", "Alpha")).toBe("Text");
  });

  it("keeps the body when the heading differs", () => {
    expect(stripLeadingTitle("# Other\nText", "Alpha")).toBe("# Other\nText");
  });
});
