import { blocksSnippets, extractPage, hasNoindex } from "./html";

const PAGE_URL = "https://docs.example.com/guide/start";

const doc = (head: string, body: string, lang = ' lang="en-GB"') =>
  `<!doctype html><html${lang}><head>${head}</head><body>${body}</body></html>`;

const jsonLd = (value: string) => `<script type="application/ld+json">${value}</script>`;

describe("extractPage", () => {
  it("extracts the head facts of a complete page", () => {
    const html = doc(
      `<title>  Getting   started &amp; setup </title>
       <meta name="description" content="Install Acme Docs in five minutes.">
       <link rel="canonical" href="/guide/start">
       <meta name="robots" content="index, follow">`,
      "<h1>Start</h1><p>Hello there</p>",
    );
    expect(extractPage(html, PAGE_URL)).toMatchObject({
      title: "Getting started & setup",
      titleLength: 23,
      metaDescription: "Install Acme Docs in five minutes.",
      descriptionLength: 34,
      h1Count: 1,
      canonical: "https://docs.example.com/guide/start",
      robotsMeta: "index, follow",
      noindex: false,
      lang: "en-GB",
    });
  });

  it("reports missing head facts as null with zero lengths", () => {
    const html = doc("", "<h1>A</h1><h1>B</h1>", "");
    expect(extractPage(html, PAGE_URL)).toMatchObject({
      title: null,
      titleLength: 0,
      metaDescription: null,
      descriptionLength: 0,
      h1Count: 2,
      canonical: null,
      robotsMeta: null,
      noindex: false,
      lang: null,
    });
  });

  it("treats an empty title as missing", () => {
    expect(extractPage(doc("<title>   </title>", ""), PAGE_URL).title).toBeNull();
  });

  it.each(["noindex", "NOINDEX, nofollow", "none"])("flags robots meta %s as noindex", (value) => {
    const html = doc(`<meta name="robots" content="${value}">`, "");
    expect(extractPage(html, PAGE_URL).noindex).toBe(true);
  });

  it("counts words in visible body text only", () => {
    const html = doc(
      "<title>Ignored words here</title>",
      `<p>One two</p><p>three<b>four</b></p>
       <script>var hidden = 1;</script><style>p { margin: 0 }</style>
       <noscript>no script text</noscript><template><p>later</p></template>`,
    );
    expect(extractPage(html, PAGE_URL).wordCount).toBe(3);
  });

  it("counts unique internal and external links and lists internal ones without fragments", () => {
    const html = doc(
      "",
      `<a href="/a">A</a><a href="/a#part">A again</a><a href="b?x=1">B</a>
       <a href="https://docs.example.com/c">C</a>
       <a href="https://www.example.org/x">X</a><a href="http://docs.example.com/d">other scheme</a>
       <a href="mailto:owner@example.com">mail</a><a href="tel:+1000">tel</a>
       <a href="javascript:void(0)">js</a><a href="#top">top</a><a>no href</a>`,
    );
    const page = extractPage(html, PAGE_URL);
    expect(page.links).toEqual([
      "https://docs.example.com/a",
      "https://docs.example.com/guide/b?x=1",
      "https://docs.example.com/c",
    ]);
    expect(page.internalLinks).toBe(3);
    expect(page.externalLinks).toBe(2);
  });

  it.each([
    ["https://www.google.com/preferences/source?q=docs.example.com", true],
    ["https://google.com/preferences/source?q=docs.example.com", true],
    ["https://www.google.com/search?q=docs.example.com", false],
    ["https://www.example.org/preferences/source?q=x", false],
  ])("links to Google Preferred Sources: %s → %s", (href, expected) => {
    const html = doc("", `<a href="${href}">Add as a preferred source on Google</a>`);
    expect(extractPage(html, PAGE_URL).preferredSourcesLink).toBe(expected);
  });

  it("resolves links against a base element", () => {
    const html = doc('<base href="https://docs.example.com/v2/">', '<a href="intro">Intro</a>');
    expect(extractPage(html, PAGE_URL).links).toEqual(["https://docs.example.com/v2/intro"]);
  });

  it("counts images and those missing an alt attribute (empty alt is decorative)", () => {
    const html = doc(
      "",
      '<img src="a.png" alt="A chart"><img src="b.png" alt=""><img src="c.png">',
    );
    expect(extractPage(html, PAGE_URL)).toMatchObject({ images: 3, imagesMissingAlt: 1 });
  });
});

describe("extractPage JSON-LD", () => {
  it("collects types from objects, arrays and @graph, sorted and unique", () => {
    const html = doc(
      [
        jsonLd('{"@context":"https://schema.org","@type":"Organization","name":"Acme"}'),
        jsonLd('[{"@type":"WebSite"},{"@type":["Article","NewsArticle"]}]'),
        jsonLd('{"@graph":[{"@type":"BreadcrumbList"},{"@type":"Organization"}]}'),
      ].join(""),
      "",
    );
    expect(extractPage(html, PAGE_URL)).toMatchObject({
      jsonLdTypes: ["Article", "BreadcrumbList", "NewsArticle", "Organization", "WebSite"],
      invalidJsonLd: 0,
      hasFaqMarkup: false,
    });
  });

  it("counts invalid blocks and ignores values that are not objects", () => {
    const html = doc(
      [
        jsonLd("{not json"),
        jsonLd('"just a string"'),
        jsonLd('{"@type":"HowTo"}'),
        jsonLd(""),
      ].join(""),
      "",
    );
    expect(extractPage(html, PAGE_URL)).toMatchObject({ jsonLdTypes: ["HowTo"], invalidJsonLd: 2 });
  });

  it("keeps the newest datePublished of article-type nodes", () => {
    const html = doc(
      [
        jsonLd('{"@type":"BlogPosting","datePublished":"2026-09-01"}'),
        jsonLd('{"@graph":[{"@type":"NewsArticle","datePublished":"2026-09-20T08:00:00Z"}]}'),
        jsonLd('{"@type":"Event","datePublished":"2026-09-30"}'),
        jsonLd('{"@type":"Article","datePublished":"not a date"}'),
      ].join(""),
      "",
    );
    expect(extractPage(html, PAGE_URL).articleDatePublished).toBe("2026-09-20T08:00:00.000Z");
  });

  it("has no article date without an article", () => {
    const html = doc(jsonLd('{"@type":"WebPage","datePublished":"2026-09-01"}'), "");
    expect(extractPage(html, PAGE_URL).articleDatePublished).toBeNull();
  });

  it("detects FAQ markup in JSON-LD", () => {
    const html = doc(jsonLd('{"@type":"FAQPage","mainEntity":[]}'), "");
    expect(extractPage(html, PAGE_URL).hasFaqMarkup).toBe(true);
  });

  it("detects FAQ markup in microdata", () => {
    const html = doc("", '<div itemscope itemtype="https://schema.org/FAQPage"></div>');
    expect(extractPage(html, PAGE_URL).hasFaqMarkup).toBe(true);
  });
});

describe("hasNoindex", () => {
  it.each([
    ["noindex", true],
    ["none", true],
    ["googlebot: noindex", true],
    ["HarbourBot: noindex", true],
    ["noindex nofollow", true],
    ["otherbot: noindex", false],
    ["otherbot: noindex, nofollow", false],
    ["otherbot: nofollow, googlebot: noindex", true],
    ["otherbot: noindex, googlebot: nofollow", false],
    ["max-snippet: 20, noindex", true],
    ["unavailable_after: 2026-12-31", false],
    ["unavailable_after: Friday, 25-Jun-10 15:00:00 PST, noindex", true],
    ["unavailable_after: Friday, 25-Jun-10 15:00:00 PST", false],
    ["index, follow", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(hasNoindex(value)).toBe(expected);
  });
});

describe("blocksSnippets", () => {
  it.each([
    ["nosnippet", true],
    ["max-snippet:0", true],
    ["max-snippet: 0", true],
    ["index, follow, max-snippet:0", true],
    ["googlebot: nosnippet", true],
    ["otherbot: nosnippet", false],
    ["otherbot: nosnippet, googlebot: max-snippet:0", true],
    ["max-snippet:-1", false],
    ["max-snippet:50", false],
    ["noindex", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(blocksSnippets(value)).toBe(expected);
  });
});

describe("extractPage snippet directives", () => {
  it("reads nosnippet from the robots or googlebot meta tag", () => {
    const robots = doc('<meta name="robots" content="index, nosnippet">', "<p>Hi</p>");
    const googlebot = doc('<meta name="googlebot" content="max-snippet:0">', "<p>Hi</p>");
    const other = doc('<meta name="otherbot" content="nosnippet">', "<p>Hi</p>");
    expect(extractPage(robots, PAGE_URL).noSnippet).toBe(true);
    expect(extractPage(googlebot, PAGE_URL).noSnippet).toBe(true);
    expect(extractPage(other, PAGE_URL).noSnippet).toBe(false);
  });

  it("counts the visible words inside data-nosnippet once, however deeply nested", () => {
    const html = doc(
      "",
      "<p>one two three four</p><div data-nosnippet>five six <span data-nosnippet>seven</span>" +
        "<script>var hidden = 1;</script></div>",
    );
    expect(extractPage(html, PAGE_URL)).toMatchObject({ wordCount: 7, nosnippetWords: 3 });
  });

  it("ignores data-nosnippet where Google ignores it: on body, main or article", () => {
    const wrapped = (tag: string) =>
      `<!doctype html><html><head><title>T</title></head><body${tag === "body" ? " data-nosnippet" : ""}>` +
      (tag === "body"
        ? "<p>one two three</p>"
        : `<${tag} data-nosnippet><p>one two three</p></${tag}>`) +
      "</body></html>";
    for (const tag of ["body", "main", "article"]) {
      expect(extractPage(wrapped(tag), PAGE_URL)).toMatchObject({
        wordCount: 3,
        nosnippetWords: 0,
      });
    }
  });

  it("counts a honoured span, div or section inside an ignored wrapper", () => {
    const html = doc(
      "",
      "<main data-nosnippet><p>one two</p><section data-nosnippet>three <div data-nosnippet>four</div></section></main>",
    );
    expect(extractPage(html, PAGE_URL)).toMatchObject({ wordCount: 4, nosnippetWords: 2 });
  });

  it("reports no hidden words when nothing is marked", () => {
    expect(extractPage(doc("", "<p>plain page</p>"), PAGE_URL)).toMatchObject({
      noSnippet: false,
      nosnippetWords: 0,
    });
  });
});
