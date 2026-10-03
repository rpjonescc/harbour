import { crawlContext as context, crawl, html, NO_HTML } from "@/tests/helpers/crawl";
import { closeSites, type Handler, never, redirect, site, text } from "@/tests/helpers/http-site";
import { createSafeFetch } from "../fetch";
import { HostLimiter } from "../host-limiter";
import { createCrawler } from "./crawler";

afterEach(closeSites);

describe("crawler robots.txt state", () => {
  it("reports a robots.txt that redirects off the allowlist and crawls on", async () => {
    const { origin } = await site({
      "/robots.txt": redirect("https://cdn.example.net/robots.txt"),
      "/": html("Home"),
    });
    const { pages, site: summary } = await crawl(context(`${origin}/`));
    expect(pages).toHaveLength(1);
    expect(summary).toMatchObject({ robotsTxt: "unfollowable_redirect", pagesCrawled: 1 });
  });

  it("reports a missing robots.txt", async () => {
    const { origin } = await site({ "/": html("Home") });
    const { site: summary } = await crawl(context(`${origin}/`));
    expect(summary).toMatchObject({ robotsTxt: "missing", sitemapsRead: 0, pagesInSitemap: 0 });
  });

  it("fails readably when robots.txt keeps it off the product URL", async () => {
    const { origin } = await site({
      "/robots.txt": text("User-agent: HarbourBot\nDisallow: /\n"),
      "/": html("Home"),
    });
    await expect(createCrawler().collect(context(`${origin}/`))).rejects.toThrow(
      `Could not crawl ${origin}/: robots.txt disallows`,
    );
  });

  it("fails readably when the product URL cannot be reached", async () => {
    const { origin } = await site({ "/robots.txt": text(""), "/": never });
    const fetch = createSafeFetch({
      allowedHosts: new Set(["127.0.0.1"]),
      allowLoopback: true,
      timeoutMs: 50,
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 1 }),
    });
    await expect(createCrawler().collect(context(`${origin}/`, { fetch }))).rejects.toThrow(
      `Could not crawl ${origin}/`,
    );
  });
});

describe("crawler sitemap failures", () => {
  it("records a listed sitemap that fails and leaves the sitemap count unknown", async () => {
    const { origin } = await site({
      "/robots.txt": text("Sitemap: /pages.xml\n"),
      "/pages.xml": (_req, res) => res.writeHead(503).end(),
      "/": html("Home"),
    });
    const { site: summary } = await crawl(context(`${origin}/`));
    expect(summary).toMatchObject({
      pagesInSitemap: null,
      sitemapLastmods: null,
      sitemapsRead: 0,
      sitemapErrors: [{ url: `${origin}/pages.xml`, status: 503 }],
    });
  });

  it("records an invalid sitemap and an off-origin one by kind", async () => {
    const { origin } = await site({
      "/robots.txt": text("Sitemap: /a.xml\nSitemap: https://cdn.example.net/b.xml\n"),
      "/a.xml": text("<html>not a sitemap</html>"),
      "/sitemap.xml": text("<urlset><url><loc>/one</loc></url></urlset>"),
      "/": html("Home"),
      "/one": html("One"),
    });
    const { site: summary } = await crawl(context(`${origin}/`));
    expect(summary).toMatchObject({
      pagesInSitemap: 1,
      sitemapErrors: [
        { url: `${origin}/a.xml`, kind: "invalid" },
        { url: "https://cdn.example.net/b.xml", kind: "off_origin" },
      ],
    });
  });

  it("treats a missing default /sitemap.xml as no sitemap, not an error", async () => {
    const { origin } = await site({ "/": html("Home") });
    const { site: summary } = await crawl(context(`${origin}/`));
    expect(summary).toMatchObject({ pagesInSitemap: 0, sitemapErrors: [] });
  });
});

describe("crawler pages", () => {
  it("follows the product URL's redirect and resolves links against the final URL", async () => {
    const { origin } = await site({
      "/": redirect("/home/"),
      "/home/": html('<a href="docs">Docs</a><a href="/home/">Home</a>'),
      "/home/docs": html("Docs"),
    });
    const { pages } = await crawl(context(`${origin}/`));
    expect(pages.map((p) => [p.subject, p.value.finalUrl])).toEqual([
      [`${origin}/`, `${origin}/home/`],
      [`${origin}/home/docs`, `${origin}/home/docs`],
    ]);
  });

  it("stays on the product's origin", async () => {
    const { origin } = await site({
      "/": (req, res) =>
        html(`<a href="http://localhost:${req.socket.localPort}/x">X</a>`)(req, res),
    });
    const { pages } = await crawl(context(`${origin}/`));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.value).toMatchObject({ internalLinks: 0, externalLinks: 1 });
  });

  it("flags an X-Robots-Tag noindex header", async () => {
    const { origin } = await site({ "/": html("Home", { "x-robots-tag": "noindex" }) });
    const { pages } = await crawl(context(`${origin}/`));
    expect(pages[0]?.value).toMatchObject({ noindex: true, robotsMeta: null });
  });

  it("flags an X-Robots-Tag header that stops Google quoting the page", async () => {
    const { origin } = await site({
      "/": html('<a href="/quiet">Quiet</a>', { "x-robots-tag": "googlebot: max-snippet:0" }),
      "/quiet": html("Quiet", { "x-robots-tag": "otherbot: nosnippet" }),
    });
    const { pages } = await crawl(context(`${origin}/`));
    const noSnippetOf = (path: string) =>
      pages.find((p) => p.subject === `${origin}${path}`)?.value.noSnippet;
    expect(noSnippetOf("/")).toBe(true);
    expect(noSnippetOf("/quiet")).toBe(false);
  });

  it("reads each X-Robots-Tag header on its own", async () => {
    const twoHeaders: Handler = (_req, res) => {
      res.setHeader("content-type", "text/html");
      res.setHeader("x-robots-tag", ["otherbot: noindex", "noindex"]);
      res.end("<html><body>Two</body></html>");
    };
    const { origin } = await site({
      "/": html('<a href="/two">Two</a><a href="/scoped">Scoped</a>'),
      "/two": twoHeaders,
      "/scoped": html("Scoped", { "x-robots-tag": "otherbot: noindex, nofollow" }),
    });
    const { pages } = await crawl(context(`${origin}/`));
    const noindexOf = (path: string) =>
      pages.find((p) => p.subject === `${origin}${path}`)?.value.noindex;
    expect(noindexOf("/two")).toBe(true);
    expect(noindexOf("/scoped")).toBe(false);
  });

  it("records other content types without HTML facts", async () => {
    const { origin } = await site({
      "/": html('<a href="/notes.txt">Notes</a>'),
      "/notes.txt": text("plain notes"),
    });
    const { pages } = await crawl(context(`${origin}/`));
    expect(pages[1]).toEqual({
      kind: "page",
      subject: `${origin}/notes.txt`,
      value: {
        status: 200,
        finalUrl: `${origin}/notes.txt`,
        ms: expect.any(Number),
        truncated: false,
        ...NO_HTML,
      },
    });
  });

  it("records pages that could not be fetched as fetch errors, not pages", async () => {
    const { origin } = await site({ "/": html('<a href="/slow">Slow</a>'), "/slow": never });
    const fetch = createSafeFetch({
      allowedHosts: new Set(["127.0.0.1"]),
      allowLoopback: true,
      timeoutMs: 200,
      limiter: new HostLimiter({ concurrency: 2, spacingMs: 1 }),
    });
    const { pages, site: summary } = await crawl(context(`${origin}/`, { fetch }));
    expect(pages).toHaveLength(1);
    expect(summary).toMatchObject({ fetchErrors: [{ url: `${origin}/slow`, kind: "timeout" }] });
  });
});

describe("crawler redirect aliases", () => {
  const titled = (title: string, body = "") =>
    text(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`, {
      "content-type": "text/html",
    });

  it("does not report a page reached through a redirect as a duplicate title", async () => {
    const { origin } = await site({
      "/": html('<a href="/a">A</a><a href="/b">B</a>'),
      "/a": redirect("/b"),
      "/b": titled("Bee"),
    });
    const { site: summary } = await crawl(context(`${origin}/`));
    expect(summary).toMatchObject({ duplicateTitles: [] });
  });

  it("does not fetch a redirect's target again", async () => {
    const { origin, hits } = await site({
      "/": html('<a href="/a">A</a>'),
      "/a": redirect("/b"),
      "/b": titled("Bee", '<a href="/b">Self</a>'),
    });
    await crawl(context(`${origin}/`));
    expect(hits.filter((path) => path === "/b")).toHaveLength(1);
  });

  it("uses the normalised product URL as the subject of its page and the site", async () => {
    const { origin } = await site({ "/": html("Home") });
    const result = await crawl(context(origin));
    expect(result.pages.map((p) => p.subject)).toEqual([`${origin}/`]);
    expect(result.subject).toBe(`${origin}/`);
  });
});

describe("crawler bounds", () => {
  it("does not count robots-blocked pages against the page cap", async () => {
    const { origin } = await site({
      "/robots.txt": text("User-agent: *\nDisallow: /private/\n"),
      "/": html('<a href="/private/x">X</a><a href="/ok">OK</a>'),
      "/ok": html("OK"),
    });
    const { pages, site: summary } = await crawl(context(`${origin}/`, {}, 2));
    expect(pages.map((p) => p.subject)).toEqual([`${origin}/`, `${origin}/ok`]);
    expect(summary).toMatchObject({ blockedByRobots: 1, limitReached: null });
  });

  it("reads at most 5 sitemaps", async () => {
    const lines = Array.from({ length: 8 }, (_, i) => `Sitemap: /s${i}.xml`).join("\n");
    const { origin, hits } = await site({ "/robots.txt": text(lines), "/": html("Home") });
    await crawl(context(`${origin}/`));
    expect(hits.filter((path) => path.endsWith(".xml"))).toHaveLength(5);
  });

  it("reads at most 5,000 sitemap URLs", async () => {
    const urls = Array.from({ length: 6000 }, (_, i) => `<url><loc>/p${i}</loc></url>`);
    const sitemap = `<urlset>${urls.join("")}</urlset>`;
    const { origin } = await site({ "/sitemap.xml": text(sitemap), "/": html("Home") });
    const { site: summary } = await crawl(context(`${origin}/`, {}, 1));
    expect(summary).toMatchObject({ pagesInSitemap: 5000, limitReached: "pages" });
  });

  it("counts dated sitemap URLs and keeps the newest 50, newest first", async () => {
    const day = (i: number) => `2026-07-${String(i + 1).padStart(2, "0")}`;
    const urls = Array.from({ length: 30 }, (_, i) => [
      `<url><loc>/a${i}</loc><lastmod>${day(i)}</lastmod></url>`,
      `<url><loc>/b${i}</loc><lastmod>${day(i)}</lastmod></url>`,
    ]).flat();
    urls.push(
      "<url><loc>/undated</loc></url>",
      "<url><loc>/bad</loc><lastmod>soon</lastmod></url>",
    );
    const sitemap = `<urlset>${urls.join("")}</urlset>`;
    const { origin } = await site({ "/sitemap.xml": text(sitemap), "/": html("Home") });
    const { site: summary } = await crawl(context(`${origin}/`, {}, 1));
    const lastmods = summary.sitemapLastmods as { dated: number; newest: { url: string }[] };
    expect(lastmods.dated).toBe(60);
    expect(lastmods.newest).toHaveLength(50);
    expect(lastmods.newest[0]).toEqual({
      url: `${origin}/a29`,
      lastmod: "2026-07-30T00:00:00.000Z",
    });
    expect(lastmods.newest[1]?.url).toBe(`${origin}/b29`);
  });

  it("stops once the crawl has read its byte budget", async () => {
    const big = "word ".repeat(400);
    const { origin } = await site({
      "/": html(`<a href="/a">A</a><a href="/b">B</a>${big}`),
      "/a": html(big),
      "/b": html(big),
    });
    const result = await createCrawler({ maxBytes: 1000 }).collect(context(`${origin}/`));
    const summary = result.status === "ok" ? result.observations.at(-1)?.value : null;
    expect(summary).toMatchObject({ pagesCrawled: 1, limitReached: "bytes" });
  });

  it("stops promptly when aborted", async () => {
    const { origin } = await site({ "/": html('<a href="/slow">Slow</a>'), "/slow": never });
    const controller = new AbortController();
    const started = performance.now();
    const run = createCrawler().collect(context(`${origin}/`, { signal: controller.signal }));
    setTimeout(() => controller.abort(new Error("Cancelled")), 100);
    await expect(run).rejects.toThrow("Cancelled");
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
