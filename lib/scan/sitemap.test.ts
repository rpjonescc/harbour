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
      locs: ["https://docs.example.com/", "https://docs.example.com/search?q=a&b=1"],
    });
  });

  it("reads child sitemaps from a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://docs.example.com/a.xml</loc></sitemap>
      <sitemap><LOC>https://docs.example.com/b.xml</LOC></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({
      kind: "index",
      locs: ["https://docs.example.com/a.xml", "https://docs.example.com/b.xml"],
    });
  });

  it("reports a document that is neither as invalid", () => {
    expect(parseSitemap("<html><body>Not a sitemap</body></html>")).toEqual({
      kind: "invalid",
      locs: [],
    });
  });

  it("reads CDATA-wrapped and namespace-prefixed entries", () => {
    const xml = `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sm:url><sm:loc>https://docs.example.com/a</sm:loc></sm:url>
      <url><loc><![CDATA[ https://docs.example.com/b?x=1&y=2 ]]></loc></url>
    </sm:urlset>`;
    expect(parseSitemap(xml)).toEqual({
      kind: "urlset",
      locs: ["https://docs.example.com/a", "https://docs.example.com/b?x=1&y=2"],
    });
  });

  it("stops reading once it has the most entries asked for", () => {
    const urls = ["a", "b", "c"].map((p) => `<url><loc>https://docs.example.com/${p}</loc></url>`);
    expect(parseSitemap(`<urlset>${urls.join("")}</urlset>`, 2).locs).toEqual([
      "https://docs.example.com/a",
      "https://docs.example.com/b",
    ]);
  });
});
