import { parseSitemap } from "./sitemap";

describe("parseSitemap", () => {
  it("reads page URLs from a urlset, decoding entities and trimming", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc> https://docs.example.com/ </loc><lastmod>2026-09-01</lastmod></url>
        <url><loc>https://docs.example.com/search?q=a&amp;b=1</loc></url>
      </urlset>`;
    expect(parseSitemap(xml)).toEqual({
      kind: "urlset",
      entries: [
        { loc: "https://docs.example.com/", lastmod: "2026-09-01" },
        { loc: "https://docs.example.com/search?q=a&b=1", lastmod: null },
      ],
    });
  });

  it("reads child sitemaps from a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://docs.example.com/a.xml</loc></sitemap>
      <sitemap><LOC>https://docs.example.com/b.xml</LOC></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({
      kind: "index",
      entries: [
        { loc: "https://docs.example.com/a.xml", lastmod: null },
        { loc: "https://docs.example.com/b.xml", lastmod: null },
      ],
    });
  });

  it("reports a document that is neither as invalid", () => {
    expect(parseSitemap("<html><body>Not a sitemap</body></html>")).toEqual({
      kind: "invalid",
      entries: [],
    });
  });

  it("reads CDATA-wrapped and namespace-prefixed entries", () => {
    const xml = `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sm:url><sm:loc>https://docs.example.com/a</sm:loc></sm:url>
      <url><loc><![CDATA[ https://docs.example.com/b?x=1&y=2 ]]></loc></url>
    </sm:urlset>`;
    expect(parseSitemap(xml)).toEqual({
      kind: "urlset",
      entries: [
        { loc: "https://docs.example.com/a", lastmod: null },
        { loc: "https://docs.example.com/b?x=1&y=2", lastmod: null },
      ],
    });
  });

  it("stops reading once it has the most entries asked for", () => {
    const urls = ["a", "b", "c"].map((p) => `<url><loc>https://docs.example.com/${p}</loc></url>`);
    const { entries } = parseSitemap(`<urlset>${urls.join("")}</urlset>`, 2);
    expect(entries.map((e) => e.loc)).toEqual([
      "https://docs.example.com/a",
      "https://docs.example.com/b",
    ]);
  });

  it("pairs each lastmod with its own url, wherever it sits in the entry", () => {
    const xml = `<urlset>
      <url><lastmod> 2026-09-20T10:00:00+00:00 </lastmod><loc>https://docs.example.com/a</loc></url>
      <url><loc>https://docs.example.com/b</loc></url>
      <lastmod>2026-01-01</lastmod>
      <url><loc>https://docs.example.com/c</loc><sm:lastmod>2026-09-01</sm:lastmod></url>
    </urlset>`;
    expect(parseSitemap(xml).entries).toEqual([
      { loc: "https://docs.example.com/a", lastmod: "2026-09-20T10:00:00+00:00" },
      { loc: "https://docs.example.com/b", lastmod: null },
      { loc: "https://docs.example.com/c", lastmod: "2026-09-01" },
    ]);
  });
});
