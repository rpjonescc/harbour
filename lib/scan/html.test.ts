import { extractPage, hasNoindex } from "./html";

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
    ["index, follow", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(hasNoindex(value)).toBe(expected);
  });
});
